import {
  ALL_FMD2_SOURCES,
  DEFAULT_ENABLED_SOURCE_IDS,
  type MangaSeries,
  type MangaChapter,
  type SourceId,
  type BrowseSortOption,
  type BrowseStatusFilter,
  type BrowseFormatFilter,
  type BrowseDemographicFilter,
  type LiveSourceBrowseOutcome,
  type LiveSourceBrowseOutcomeKind,
} from '../utils/fmdLogic.ts';
import {
  IMAGE_PROXY_SIGNATURE_TTL_MS,
  signImageProxyRequest,
} from './imageProxySecurity.ts';

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

export interface ConnectorHealthStatus {
  sourceId: SourceId;
  name: string;
  luaModule: string;
  domain: string;
  online: boolean;
  statusCode: number;
  latencyMs: number;
  mode: 'Direct Scraper';
  message: string;
}

export interface LiveChapterPageResult {
  sourceId: SourceId;
  luaModule: string;
  chapterTitle: string;
  pages: string[]; // Proxied URLs ready for <img>
  rawUpstreamPages: { url: string; referer: string }[];
}

export interface LiveBrowseParams {
  sourceId?: SourceId | 'ALL';
  query?: string;
  sortBy?: BrowseSortOption;
  status?: BrowseStatusFilter;
  format?: BrowseFormatFilter;
  demographic?: BrowseDemographicFilter;
  minChapters?: number;
  page?: number;
  forceRefresh?: boolean;
  /** Internal fetch seam used by deterministic adapter tests. */
  fetcher?: typeof fetch;
  /** Internal switch that lets the unified browse route observe adapter failures. */
  reportFailures?: boolean;
}

export interface LiveBrowseResult {
  results: MangaSeries[];
  /** Sources for which this request attempted a live query. */
  sourcesQueried: SourceId[];
  sourceOutcomes: LiveSourceBrowseOutcome[];
}

class LiveSourceFailure extends Error {
  constructor(
    readonly outcome: LiveSourceBrowseOutcomeKind,
    message: string
  ) {
    super(message);
    this.name = 'LiveSourceFailure';
  }
}

function normalizeLiveSourceFailure(error: unknown): LiveSourceFailure {
  if (error instanceof LiveSourceFailure) return error;
  const name = error instanceof Error ? error.name : '';
  if (name === 'TimeoutError' || name === 'AbortError') {
    return new LiveSourceFailure('timeout', 'The upstream source timed out.');
  }
  if (error instanceof SyntaxError) {
    return new LiveSourceFailure('parse_error', 'The upstream response could not be parsed.');
  }
  return new LiveSourceFailure('network_error', 'The upstream source could not be reached.');
}

function isRecognizedEmptyPage(html: string): boolean {
  return /\b(?:no results?|no (?:manga|comics|series|titles?) found|nothing found|0 results)\b/i.test(
    stripHtmlTags(html)
  );
}

function throwForUnrecognizedEmptyPage(sourceId: SourceId, html: string): void {
  if (!isRecognizedEmptyPage(html)) {
    throw new LiveSourceFailure(
      'parse_error',
      `The ${sourceId} response did not match the expected result or empty-state markup.`
    );
  }
}

// In-memory cache to keep repeated searches, browse pages & chapter loads fast
const browseCache = new Map<string, { expires: number; result: LiveBrowseResult }>();
const sourceBrowseCache = new Map<string, { results: MangaSeries[]; fetchedAt: string }>();
const searchCache = new Map<string, { expires: number; results: MangaSeries[] }>();
const chaptersCache = new Map<string, { expires: number; chapters: MangaChapter[] }>();
const pagesCache = new Map<string, { expires: number; data: LiveChapterPageResult }>();

const COVER_THEMES = [
  'shadow-monarch',
  'eclipse-berserk',
  'omniscient-star',
  'ronin-ink',
  'cyber-blame',
  'chainsaw-devil',
  'frieren-mage',
  'dungeon-feast',
] as const;

export function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&rsquo;/g, "'")
    .replace(/&lsquo;/g, "'")
    .replace(/&ldquo;/g, '"')
    .replace(/&rdquo;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

export function stripHtmlTags(input: string): string {
  return decodeHtmlEntities(
    input
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<\/p>/gi, ' ')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

export function buildProxiedImageUrl(targetUrl: string, referer: string): string {
  const expiresAt = Date.now() + IMAGE_PROXY_SIGNATURE_TTL_MS;
  const signature = signImageProxyRequest(targetUrl, referer, expiresAt);
  return `/api/proxy/image?url=${encodeURIComponent(targetUrl)}&referer=${encodeURIComponent(
    referer
  )}&expires=${expiresAt}&signature=${signature}`;
}

// ============================================================================
// 1. WEEBCENTRAL.LUA LIVE SCRAPER (https://weebcentral.com)
// ============================================================================

export async function getWeebCentralChapters(
  wcSeriesIdOrTitle: string,
  fetcher: typeof fetch = fetch
): Promise<MangaChapter[]> {
  const cacheKey = `wc-ch:${wcSeriesIdOrTitle.toLowerCase()}`;
  const cached = chaptersCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return cached.chapters;
  }

  try {
    let seriesId = wcSeriesIdOrTitle.replace(/^wc-/i, '');
    if (!/^[0-9A-Z]{20,}$/i.test(seriesId)) {
      const searchRes = await fetcher('https://weebcentral.com/search/simple?location=main', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'HX-Request': 'true',
          'User-Agent': BROWSER_UA,
          Referer: 'https://weebcentral.com/',
        },
        body: `text=${encodeURIComponent(wcSeriesIdOrTitle)}`,
        signal: AbortSignal.timeout(4000),
      });
      if (searchRes.ok) {
        const sHtml = await searchRes.text();
        const idMatch = sHtml.match(/https:\/\/weebcentral\.com\/series\/([0-9A-Z]{20,})\//i);
        if (idMatch) {
          seriesId = idMatch[1];
        }
      }
    } else {
      seriesId = seriesId.toUpperCase();
    }

    if (!/^[0-9A-Z]{20,}$/.test(seriesId)) {
      return [];
    }

    const chRes = await fetcher(`https://weebcentral.com/series/${seriesId}/full-chapter-list`, {
      headers: {
        'HX-Request': 'true',
        'User-Agent': BROWSER_UA,
        Referer: `https://weebcentral.com/series/${seriesId}`,
      },
      signal: AbortSignal.timeout(4500),
    });

    if (!chRes.ok) return [];
    const html = await chRes.text();

    const chRegex =
      /href="(?:https:\/\/weebcentral\.com)?\/chapters\/([0-9A-Z]+)"[\s\S]*?<span\s+class="">([^<]+)<\/span>(?:[\s\S]*?<time[^>]*datetime="([^"]+)")?/gi;

    const chapters: MangaChapter[] = [];
    const seenNums = new Set<number>();
    let match: RegExpExecArray | null;

    while ((match = chRegex.exec(html)) !== null && chapters.length < 2000) {
      const chId = match[1];
      const rawLabel = decodeHtmlEntities(match[2].replace(/\s+/g, ' ').trim());
      const rawDate = match[3] ? match[3].slice(0, 10) : '2025-01-01';
      const numMatch = rawLabel.match(/(\d+(?:\.\d+)?)/);
      const chNum = numMatch ? Number(numMatch[1]) : chapters.length + 1;

      if (seenNums.has(chNum)) continue;
      seenNums.add(chNum);

      chapters.push({
        id: `wc-ch-${chId}`,
        number: chNum,
        title: rawLabel,
        releaseDate: rawDate,
        scanlationGroup: 'WeebCentral (WeebCentral.lua)',
        pagesCount: 18,
        sourceId: 'weebcentral',
        language: 'EN',
        externalId: `wc:${chId}`,
      });
    }

    if (chapters.length > 0) {
      chaptersCache.set(cacheKey, {
        expires: Date.now() + 15 * 60 * 1000,
        chapters,
      });
      chaptersCache.set(`wc-ch:${seriesId.toLowerCase()}`, {
        expires: Date.now() + 15 * 60 * 1000,
        chapters,
      });
    }
    return chapters;
  } catch {
    return [];
  }
}

export async function browseWeebCentralLive(params: LiveBrowseParams = {}): Promise<MangaSeries[]> {
  try {
    const fetcher = params.fetcher || fetch;
    const page = Math.max(1, params.page || 1);
    const limit = 20;
    const offset = (page - 1) * limit;

    let sortParam = 'Popularity';
    let orderParam = 'Descending';
    if (params.sortBy === 'latest') sortParam = 'Latest Updates';
    else if (params.sortBy === 'year_desc') sortParam = 'Release Date';
    else if (params.sortBy === 'title') {
      sortParam = 'Alphabet';
      orderParam = 'Ascending';
    } else if (params.sortBy === 'rating') {
      sortParam = 'Subscriber';
    }

    const urlParams = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
      sort: sortParam,
      order: orderParam,
      official: 'Any',
      anime: 'Any',
      adult: 'Any',
      display_mode: 'Full Display',
    });

    if (params.query && params.query.trim()) {
      urlParams.set('text', params.query.trim());
    }
    if (params.status && params.status !== 'All') {
      urlParams.set('included_status', params.status === 'Completed' ? 'Complete' : params.status);
    }
    if (params.format && params.format !== 'All') {
      urlParams.set('included_type', params.format === 'Webtoon' ? 'Manhwa' : params.format);
    }

    const res = await fetcher(`https://weebcentral.com/search/data?${urlParams.toString()}`, {
      headers: {
        'User-Agent': BROWSER_UA,
        Referer: 'https://weebcentral.com/search',
        'HX-Request': 'true',
      },
      signal: AbortSignal.timeout(5500),
    });

    if (!res.ok) {
      throw new LiveSourceFailure('http_error', `WeebCentral returned HTTP ${res.status}.`);
    }
    const html = await res.text();
    const blocks = html.split(/<article\s+class="bg-base-300\s+flex\s+gap-4\s+p-4">/i).slice(1);

    const parsedCards: {
      wcSeriesId: string;
      slug: string;
      rawTitle: string;
      coverUrl?: string;
      year: number;
      status: MangaSeries['status'];
      seriesType: string;
      author: string;
      rawTags: string[];
      demographic: string;
      idx: number;
    }[] = [];

    for (let idx = 0; idx < blocks.length && parsedCards.length < 20; idx++) {
      const b = blocks[idx];
      const linkM = b.match(/href="https:\/\/weebcentral\.com\/series\/([0-9A-Z]+)\/([^"]+)"/i);
      if (!linkM) continue;

      const wcSeriesId = linkM[1];
      const slug = linkM[2];
      const titleM =
        b.match(/class="line-clamp-1\s+link\s+link-hover">([^<]+)<\/a>/i) ||
        b.match(/<div\s+class="text-ellipsis\s+truncate[^"]*">([^<]+)<\/div>/i);
      const rawTitle = titleM ? decodeHtmlEntities(titleM[1].trim()) : slug.replace(/-/g, ' ');
      if (!rawTitle) continue;

      const imgM =
        b.match(/<source\s+srcset="(https:\/\/[^"]+\.webp)"/i) ||
        b.match(/<img\s+src="(https:\/\/[^"]+)"/i);
      const rawCover = imgM ? imgM[1] : undefined;
      const coverUrl = rawCover
        ? buildProxiedImageUrl(rawCover, 'https://weebcentral.com/')
        : undefined;

      const yearM = b.match(/<strong>Year:<\/strong>\s*<span>(\d{4})<\/span>/i);
      const year = yearM ? Number(yearM[1]) : 2024;

      const statusM = b.match(/<strong>Status:<\/strong>\s*<span>([^<]+)<\/span>/i);
      const rawStatus = statusM ? statusM[1].trim().toLowerCase() : 'ongoing';
      const status: MangaSeries['status'] =
        rawStatus.includes('complete')
          ? 'Completed'
          : rawStatus.includes('hiatus')
          ? 'Hiatus'
          : 'Ongoing';

      const typeM = b.match(/<strong>Type:<\/strong>\s*<span>([^<]+)<\/span>/i);
      const seriesType = typeM ? typeM[1].trim() : 'Manga';

      const authorM = b.match(/Author\(s\):\s*<\/strong>[\s\S]*?<a[^>]*>([^<]+)<\/a>/i);
      const author = authorM ? decodeHtmlEntities(authorM[1].trim()) : 'Unknown Author';

      const tagsBlock = b.match(/<strong>Tag\(s\):\s*<\/strong>([\s\S]*?)<\/div>/i);
      const rawTags = tagsBlock
        ? [...tagsBlock[1].matchAll(/<span>([^<,]+),?<\/span>/gi)]
            .map((m) => decodeHtmlEntities(m[1].trim()))
            .filter(Boolean)
        : ['Action'];

      const demographicTag = rawTags.find((t) =>
        ['Seinen', 'Shounen', 'Shoujo', 'Josei'].includes(t)
      );
      const demographic =
        seriesType === 'Manhwa' || seriesType === 'Manhua'
          ? seriesType
          : demographicTag || seriesType;

      parsedCards.push({
        wcSeriesId,
        slug,
        rawTitle,
        coverUrl,
        year,
        status,
        seriesType,
        author,
        rawTags,
        demographic,
        idx,
      });
    }

    if (parsedCards.length === 0) {
      throwForUnrecognizedEmptyPage('weebcentral', html);
    }

    // Fetch real chapter lists in parallel so every WeebCentral series has its true chapter count & real chapters
    const chapterLists = await Promise.all(
      parsedCards.map((card) => getWeebCentralChapters(card.wcSeriesId, fetcher))
    );

    const results: MangaSeries[] = [];
    for (let i = 0; i < parsedCards.length; i++) {
      const card = parsedCards[i];
      const realChapters = chapterLists[i];
      const fallbackChapter: MangaChapter = {
        id: `wc-${card.wcSeriesId.toLowerCase()}-ch-1`,
        number: 1,
        title: 'Chapter 1',
        releaseDate: `${card.year}-01-01`,
        scanlationGroup: 'WeebCentral (WeebCentral.lua)',
        pagesCount: 18,
        sourceId: 'weebcentral',
        language: 'EN',
        externalId: `wc-series:${card.wcSeriesId}:1`,
      };

      const chaptersToAttach =
        realChapters.length > 0 ? realChapters : [fallbackChapter];

      results.push({
        id: `wc-${card.wcSeriesId.toLowerCase()}`,
        slug: card.slug.toLowerCase(),
        title: card.rawTitle,
        altTitles: [`https://weebcentral.com/series/${card.wcSeriesId}/${card.slug}`],
        author: card.author,
        artist: card.author,
        status: card.status,
        year: card.year,
        rating: Number((9.4 - (card.idx % 9) * 0.08).toFixed(1)),
        demographic: card.demographic,
        genres: card.rawTags.length > 0 ? card.rawTags : ['Action'],
        metadataTags: [card.seriesType],
        synopsis: `${card.rawTitle} by ${card.author} (${card.year}, ${card.status}). Indexed from WeebCentral (${card.rawTags.join(', ')}).`,
        availableSources: ['weebcentral'],
        primarySource: 'weebcentral',
        coverTheme: COVER_THEMES[card.idx % COVER_THEMES.length],
        coverUrl: card.coverUrl,
        totalChapters: realChapters.length > 0 ? realChapters.length : 1,
        chapters: chaptersToAttach,
      });
    }

    return results;
  } catch (error) {
    if (params.reportFailures) throw normalizeLiveSourceFailure(error);
    return [];
  }
}

export async function searchWeebCentralLive(
  query: string,
  _enabledSources: SourceId[]
): Promise<MangaSeries[]> {
  const fromBrowse = await browseWeebCentralLive({ query, page: 1 });
  return fromBrowse.slice(0, 12);
}

export async function getWeebCentralChapterPages(
  wcChapterId: string
): Promise<{ url: string; referer: string }[]> {
  try {
    const cleanId = wcChapterId.replace(/^wc:/, '').replace(/^wc-ch-/, '');
    if (!/^[0-9A-Z]{15,}$/i.test(cleanId)) return [];

    const res = await fetch(
      `https://weebcentral.com/chapters/${cleanId}/images?is_prev=False&current_page=1&reading_style=long_strip`,
      {
        headers: {
          'HX-Request': 'true',
          'User-Agent': BROWSER_UA,
          Referer: `https://weebcentral.com/chapters/${cleanId}`,
        },
        signal: AbortSignal.timeout(5000),
      }
    );

    if (!res.ok) return [];
    const html = await res.text();
    const imgRegex = /<img[^>]+src="(https:\/\/[^"]+)"/gi;
    const pages: { url: string; referer: string }[] = [];
    let match: RegExpExecArray | null;
    while ((match = imgRegex.exec(html)) !== null) {
      const url = match[1];
      if (!url.includes('broken_image')) {
        pages.push({ url, referer: 'https://weebcentral.com/' });
      }
    }
    return pages;
  } catch {
    return [];
  }
}

// ============================================================================
// 2. ASURASCANS.LUA LIVE SCRAPER (https://asurascans.com)
// ============================================================================

function unwrapAstroProps(v: any): any {
  if (Array.isArray(v)) {
    const [type, val] = v;
    if (type === 0) return unwrapAstroProps(val);
    if (type === 1 && Array.isArray(val)) return val.map(unwrapAstroProps);
    return v;
  }
  if (v && typeof v === 'object') {
    return Object.fromEntries(
      Object.entries(v).map(([k, val]) => [k, unwrapAstroProps(val)])
    );
  }
  return v;
}

export async function browseAsuraScansLive(params: LiveBrowseParams = {}): Promise<MangaSeries[]> {
  try {
    const fetcher = params.fetcher || fetch;
    const page = Math.max(1, params.page || 1);
    const urlParams = new URLSearchParams({
      page: String(page),
    });

    if (params.query && params.query.trim()) {
      urlParams.set('q', params.query.trim());
    }
    if (params.status && params.status !== 'All') {
      urlParams.set('status', params.status.toLowerCase());
    }
    if (params.minChapters && params.minChapters > 0) {
      urlParams.set('min_chapters', String(params.minChapters));
    }

    let order = 'update';
    if (params.sortBy === 'popular') order = 'popular';
    else if (params.sortBy === 'rating') order = 'rating';
    else if (params.sortBy === 'title') order = 'title';
    urlParams.set('order', order);

    const res = await fetcher(`https://asurascans.com/browse/comics?${urlParams.toString()}`, {
      headers: {
        'User-Agent': BROWSER_UA,
        Referer: 'https://asurascans.com/',
      },
      signal: AbortSignal.timeout(6000),
    });

    if (!res.ok) {
      throw new LiveSourceFailure('http_error', `Asura Scans returned HTTP ${res.status}.`);
    }
    const html = await res.text();

    const islands = [...html.matchAll(/props="([^"]+)"/gi)];
    let rawSeriesList: any[] = [];
    let foundInitialSeriesArray = false;
    let initialSeriesParseFailed = false;

    for (const m of islands) {
      const rawJson = decodeHtmlEntities(m[1]);
      if (rawJson.includes('initialSeries') && rawJson.includes('public_url')) {
        try {
          const parsed = unwrapAstroProps(JSON.parse(rawJson));
          if (Array.isArray(parsed?.initialSeries)) {
            rawSeriesList = parsed.initialSeries;
            foundInitialSeriesArray = true;
            break;
          }
        } catch {
          initialSeriesParseFailed = true;
        }
      }
    }

    if (!foundInitialSeriesArray && (initialSeriesParseFailed || !isRecognizedEmptyPage(html))) {
      throw new LiveSourceFailure(
        'parse_error',
        'The Asura Scans response did not contain a valid series list or empty-state marker.'
      );
    }

    const mapped: MangaSeries[] = [];
    for (let idx = 0; idx < rawSeriesList.length; idx++) {
      const item = rawSeriesList[idx];
      const rawTitle = String(item.title || '').trim();
      if (!rawTitle) continue;

      const publicUrl: string = item.public_url || `/comics/${item.slug}`;
      const rawCover: string | undefined = item.cover || item.cover_url;
      const coverUrl =
        rawCover && rawCover.startsWith('http')
          ? buildProxiedImageUrl(rawCover, 'https://asurascans.com/')
          : undefined;

      const genres: string[] = Array.isArray(item.genres)
        ? item.genres.map((g: any) => String(g?.name || '').trim()).filter(Boolean)
        : ['Action', 'Fantasy'];

      const rawType = String(item.type || 'manhwa').toLowerCase();
      const demographic =
        rawType === 'manhua' ? 'Manhua' : rawType === 'manga' ? 'Manga' : 'Manhwa';

      const rawStatus = String(item.status || 'ongoing').toLowerCase();
      const status: MangaSeries['status'] =
        rawStatus === 'completed'
          ? 'Completed'
          : rawStatus === 'hiatus'
          ? 'Hiatus'
          : 'Ongoing';

      const totalChapters = Math.max(1, Number(item.chapter_count) || 1);
      const rawRating = Number(item.rating) || 9.1;
      const normalizedRating =
        rawRating <= 5
          ? Number((rawRating * 1.9).toFixed(1))
          : Number(Math.min(9.9, Math.max(7.8, rawRating)).toFixed(1));

      const chapters: MangaChapter[] = [];
      const seenNums = new Set<number>();

      if (Array.isArray(item.latest_chapters) && item.latest_chapters.length > 0) {
        for (const ch of item.latest_chapters) {
          const chNum = Number(ch.number);
          if (Number.isNaN(chNum) || seenNums.has(chNum)) continue;
          seenNums.add(chNum);
          const chTitle =
            ch.title && String(ch.title).trim()
              ? `Chapter ${chNum}: ${String(ch.title).trim()}`
              : `Chapter ${chNum}`;
          chapters.push({
            id: `as-${item.id}-ch-${chNum}`,
            number: chNum,
            title: chTitle,
            releaseDate: ch.published_at
              ? String(ch.published_at).slice(0, 10)
              : '2026-10-16',
            scanlationGroup: 'Asura Scans (AsuraScans.lua)',
            pagesCount: 24,
            sourceId: 'asurascans',
            language: 'EN',
            externalId: `as-ch:${publicUrl}/chapter/${chNum}`,
          });
        }
      }

      if (!seenNums.has(1)) {
        chapters.push({
          id: `as-${item.id}-ch-1`,
          number: 1,
          title: 'Chapter 1',
          releaseDate: `${Number(item.release_year) || 2024}-01-01`,
          scanlationGroup: 'Asura Scans (AsuraScans.lua)',
          pagesCount: 24,
          sourceId: 'asurascans',
          language: 'EN',
          externalId: `as-ch:${publicUrl}/chapter/1`,
        });
      }

      chapters.sort((a, b) => b.number - a.number);
      const cleanDesc = stripHtmlTags(String(item.description || ''));

      mapped.push({
        id: `as-${item.slug || item.id}`,
        slug: publicUrl.replace(/^\/comics\//, ''),
        title: rawTitle,
        altTitles: [`https://asurascans.com${publicUrl}`],
        author: item.author ? String(item.author) : 'Unknown Author',
        artist: item.artist ? String(item.artist) : item.author ? String(item.author) : 'Studio',
        status,
        year: Number(item.release_year) || 2025,
        rating: normalizedRating,
        demographic,
        genres: genres.length > 0 ? genres : ['Action', 'Fantasy'],
        metadataTags: [demographic, 'Webtoon', 'Full Color'],
        synopsis:
          cleanDesc.length > 15
            ? cleanDesc.slice(0, 420)
            : `${rawTitle} on Asura Scans (${totalChapters} chapters).`,
        availableSources: ['asurascans'],
        primarySource: 'asurascans',
        coverTheme: COVER_THEMES[(idx + 1) % COVER_THEMES.length],
        coverUrl,
        totalChapters,
        chapters,
      });
    }

    if (rawSeriesList.length > 0 && mapped.length === 0) {
      throw new LiveSourceFailure('parse_error', 'The Asura Scans series payload could not be mapped.');
    }

    return mapped;
  } catch (error) {
    if (params.reportFailures) throw normalizeLiveSourceFailure(error);
    return [];
  }
}

export async function getAsuraScansChapters(
  slugOrTitle: string,
  explicitSlug?: string
): Promise<MangaChapter[]> {
  const key = (explicitSlug || slugOrTitle).toLowerCase();
  const cacheKey = `as-ch:${key}`;
  const cached = chaptersCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return cached.chapters;
  }

  try {
    let comicPath = (explicitSlug || slugOrTitle).replace(/^as-/i, '');
    if (!comicPath.startsWith('/comics/')) {
      if (/^[a-z0-9-]+-[0-9a-f]{8}$/i.test(comicPath)) {
        comicPath = `/comics/${comicPath}`;
      } else {
        const searchList = await browseAsuraScansLive({ query: slugOrTitle, page: 1 });
        if (searchList.length > 0) {
          comicPath = `/comics/${searchList[0].slug}`;
        }
      }
    }

    if (!comicPath.startsWith('/comics/')) return [];

    const res = await fetch(`https://asurascans.com${comicPath}`, {
      headers: { 'User-Agent': BROWSER_UA, Referer: 'https://asurascans.com/' },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const html = await res.text();

    const escapedPath = comicPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const chRegex = new RegExp(`href="(${escapedPath}\\/chapter\\/(\\d+(?:\\.\\d+)?))"`, 'gi');

    const chapters: MangaChapter[] = [];
    const seenNums = new Set<number>();
    let match: RegExpExecArray | null;

    while ((match = chRegex.exec(html)) !== null && chapters.length < 300) {
      const chPath = match[1];
      const chNum = Number(match[2]);
      if (Number.isNaN(chNum) || seenNums.has(chNum)) continue;
      seenNums.add(chNum);

      chapters.push({
        id: `as-ch-${chNum}`,
        number: chNum,
        title: `Chapter ${chNum}`,
        releaseDate: '2026-10-16',
        scanlationGroup: 'Asura Scans (AsuraScans.lua)',
        pagesCount: 28,
        sourceId: 'asurascans',
        language: 'EN',
        externalId: `as-ch:${chPath}`,
      });
    }

    chapters.sort((a, b) => b.number - a.number);

    if (chapters.length > 0) {
      chaptersCache.set(cacheKey, {
        expires: Date.now() + 10 * 60 * 1000,
        chapters,
      });
    }
    return chapters;
  } catch {
    return [];
  }
}

export async function getAsuraScansChapterPages(
  asExternalId: string
): Promise<{ url: string; referer: string }[]> {
  try {
    let chPath = asExternalId.replace(/^as-ch:/, '');
    if (chPath.startsWith('as-series:')) {
      const parts = chPath.replace(/^as-series:/, '').split(':');
      if (parts.length >= 2) {
        chPath = `${parts[0]}/chapter/${parts[1]}`;
      }
    }
    if (!chPath.startsWith('/comics/')) return [];

    const res = await fetch(`https://asurascans.com${chPath}`, {
      headers: { 'User-Agent': BROWSER_UA, Referer: 'https://asurascans.com/' },
      signal: AbortSignal.timeout(5500),
    });
    if (!res.ok) return [];
    const html = await res.text();

    const imgRegex =
      /https:\/\/cdn\.asurascans\.com\/asura-images\/chapters\/[^\s"'\''&\\]+\.(?:webp|jpg|jpeg|png)/gi;
    const seen = new Set<string>();
    const pages: { url: string; referer: string }[] = [];
    let match: RegExpExecArray | null;
    while ((match = imgRegex.exec(html)) !== null) {
      const url = match[0];
      if (!seen.has(url)) {
        seen.add(url);
        pages.push({ url, referer: 'https://asurascans.com/' });
      }
    }
    return pages;
  } catch {
    return [];
  }
}

// ============================================================================
// 3. MANGADEX.LUA LIVE SCRAPER (https://api.mangadex.org)
// ============================================================================

export async function getMangaDexChapters(mangaIdOrTitle: string): Promise<MangaChapter[]> {
  const cacheKey = `md-ch:${mangaIdOrTitle.toLowerCase()}`;
  const cached = chaptersCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return cached.chapters;
  }

  try {
    let mangaUuid = mangaIdOrTitle.replace(/^md-/i, '');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(mangaUuid)) {
      const searchUrl = `https://api.mangadex.org/manga?title=${encodeURIComponent(
        mangaIdOrTitle
      )}&limit=5&availableTranslatedLanguage[]=en&hasAvailableChapters=true`;
      const sRes = await fetch(searchUrl, {
        headers: { 'User-Agent': 'FMD2-Studio/2.0' },
        signal: AbortSignal.timeout(4000),
      });
      if (sRes.ok) {
        const sData = (await sRes.json()) as any;
        if (Array.isArray(sData?.data) && sData.data.length > 0) {
          mangaUuid = sData.data[0].id;
        }
      }
    }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(mangaUuid)) return [];

    const feedUrl = `https://api.mangadex.org/manga/${mangaUuid}/feed?translatedLanguage[]=en&includeExternalUrl=0&limit=96&order[chapter]=desc&contentRating[]=safe&contentRating[]=suggestive`;
    const res = await fetch(feedUrl, {
      headers: { 'User-Agent': 'FMD2-Studio/2.0' },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as any;
    const items = Array.isArray(data?.data) ? data.data : [];

    const chapters: MangaChapter[] = [];
    const seenNums = new Set<number>();

    for (const ch of items) {
      const attrs = ch.attributes || {};
      if (Number(attrs.pages) <= 0) continue;
      const chNum =
        attrs.chapter !== null && attrs.chapter !== undefined && attrs.chapter !== ''
          ? Number(attrs.chapter)
          : chapters.length + 1;
      if (Number.isNaN(chNum) || seenNums.has(chNum)) continue;
      seenNums.add(chNum);

      chapters.push({
        id: `md-ch-${ch.id}`,
        number: chNum,
        title: attrs.title ? `Chapter ${chNum}: ${attrs.title}` : `Chapter ${chNum}`,
        volume: attrs.volume ? String(attrs.volume) : undefined,
        releaseDate: attrs.publishAt ? String(attrs.publishAt).slice(0, 10) : '2026-01-01',
        scanlationGroup: 'MangaDex (MangaDex.lua)',
        pagesCount: Number(attrs.pages) || 18,
        sourceId: 'mangadex',
        language: 'EN',
        externalId: `md-ch:${ch.id}`,
      });
    }

    if (chapters.length > 0) {
      chaptersCache.set(cacheKey, {
        expires: Date.now() + 15 * 60 * 1000,
        chapters,
      });
      chaptersCache.set(`md-ch:${mangaUuid.toLowerCase()}`, {
        expires: Date.now() + 15 * 60 * 1000,
        chapters,
      });
    }
    return chapters;
  } catch {
    return [];
  }
}

export async function browseMangaDexLive(params: LiveBrowseParams = {}): Promise<MangaSeries[]> {
  try {
    const fetcher = params.fetcher || fetch;
    const page = Math.max(1, params.page || 1);
    const limit = 20;
    const offset = (page - 1) * limit;

    const queryParts: string[] = [
      `limit=${limit}`,
      `offset=${offset}`,
      'includes[]=cover_art',
      'includes[]=author',
      'includes[]=artist',
      'contentRating[]=safe',
      'contentRating[]=suggestive',
      'hasAvailableChapters=true',
      'availableTranslatedLanguage[]=en',
    ];

    if (params.query && params.query.trim()) {
      queryParts.push(`title=${encodeURIComponent(params.query.trim())}`);
    }
    if (params.status && params.status !== 'All') {
      queryParts.push(`status[]=${params.status.toLowerCase()}`);
    }
    if (params.demographic && ['Seinen', 'Shounen', 'Shoujo', 'Josei'].includes(params.demographic)) {
      queryParts.push(`publicationDemographic[]=${params.demographic.toLowerCase()}`);
    }
    if (params.format === 'Manga') {
      queryParts.push('originalLanguage[]=ja');
    } else if (params.format === 'Manhwa' || params.format === 'Webtoon') {
      queryParts.push('originalLanguage[]=ko');
    } else if (params.format === 'Manhua') {
      queryParts.push('originalLanguage[]=zh');
      queryParts.push('originalLanguage[]=zh-hk');
    }

    if (params.sortBy === 'latest') {
      queryParts.push('order[latestUploadedChapter]=desc');
    } else if (params.sortBy === 'rating') {
      queryParts.push('order[rating]=desc');
    } else if (params.sortBy === 'year_desc') {
      queryParts.push('order[year]=desc');
    } else if (params.sortBy === 'title') {
      queryParts.push('order[title]=asc');
    } else {
      queryParts.push('order[followedCount]=desc');
    }

    const url = `https://api.mangadex.org/manga?${queryParts.join('&')}`;
    const response = await fetcher(url, {
      headers: { 'User-Agent': 'FMD2-Studio/2.0' },
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      throw new LiveSourceFailure('http_error', `MangaDex returned HTTP ${response.status}.`);
    }
    const data = (await response.json()) as any;
    if (!Array.isArray(data?.data)) {
      throw new LiveSourceFailure('parse_error', 'The MangaDex response did not contain a data array.');
    }
    const items = data.data;

    const results: MangaSeries[] = [];
    for (let idx = 0; idx < items.length; idx++) {
      const item = items[idx];
      const attrs = item.attributes || {};
      const titleObj = attrs.title || {};
      const rawTitle =
        titleObj.en ||
        titleObj['ja-ro'] ||
        titleObj['ko-ro'] ||
        titleObj.ja ||
        Object.values(titleObj)[0];
      if (!rawTitle || typeof rawTitle !== 'string') continue;

      const altTitlesList: string[] = [];
      if (Array.isArray(attrs.altTitles)) {
        for (const altObj of attrs.altTitles) {
          const val = Object.values(altObj)[0];
          if (typeof val === 'string') altTitlesList.push(val);
        }
      }

      const descObj = attrs.description || {};
      const synopsis =
        descObj.en ||
        Object.values(descObj)[0] ||
        `${rawTitle} on MangaDex.`;

      const rels = Array.isArray(item.relationships) ? item.relationships : [];
      const authorRel = rels.find((r: any) => r.type === 'author');
      const artistRel = rels.find((r: any) => r.type === 'artist');
      const coverRel = rels.find((r: any) => r.type === 'cover_art');
      const fileName = coverRel?.attributes?.fileName;
      const coverUrl = fileName
        ? `/api/proxy/cover?mangaId=${encodeURIComponent(item.id)}&fileName=${encodeURIComponent(
            fileName
          )}`
        : undefined;

      const origLang = String(attrs.originalLanguage || 'ja').toLowerCase();
      const rawDemo = attrs.publicationDemographic
        ? String(attrs.publicationDemographic)
        : '';
      const formattedDemo = rawDemo
        ? rawDemo.charAt(0).toUpperCase() + rawDemo.slice(1).toLowerCase()
        : origLang === 'ko'
        ? 'Manhwa'
        : origLang.startsWith('zh')
        ? 'Manhua'
        : 'Manga';

      const tags: string[] = (attrs.tags || [])
        .map((t: any) => t?.attributes?.name?.en)
        .filter(Boolean)
        .slice(0, 6);

      const parsedLastCh = Number(attrs.lastChapter);
      const totalChapters =
        !Number.isNaN(parsedLastCh) && parsedLastCh > 0 ? Math.round(parsedLastCh) : 1;

      const rawStatus = String(attrs.status || 'ongoing').toLowerCase();
      const status: MangaSeries['status'] =
        rawStatus === 'completed'
          ? 'Completed'
          : rawStatus === 'hiatus'
          ? 'Hiatus'
          : 'Ongoing';

      // Check if we already cached the real chapter feed for this MangaDex UUID
      const cachedChaps = chaptersCache.get(`md-ch:${String(item.id).toLowerCase()}`)?.chapters;
      const initialChapters: MangaChapter[] =
        cachedChaps && cachedChaps.length > 0
          ? cachedChaps
          : [
              {
                id: `md-${item.id}-ch-1`,
                number: 1,
                title: 'Chapter 1',
                releaseDate: `${Number(attrs.year) || 2023}-01-01`,
                scanlationGroup: 'MangaDex (MangaDex.lua)',
                pagesCount: 18,
                sourceId: 'mangadex',
                language: 'EN',
                externalId: `md-series:${item.id}:1`,
              },
            ];

      results.push({
        id: `md-${item.id}`,
        slug: String(rawTitle)
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-'),
        title: String(rawTitle),
        altTitles: altTitlesList.slice(0, 6),
        author: authorRel?.attributes?.name || 'Unknown Author',
        artist: artistRel?.attributes?.name || authorRel?.attributes?.name || 'Unknown Artist',
        status,
        year: Number(attrs.year) || 2023,
        rating: Number((9.2 - (idx % 8) * 0.09).toFixed(1)),
        demographic: formattedDemo,
        genres: tags.length > 0 ? tags : ['Action'],
        metadataTags:
          origLang === 'ko'
            ? ['Manhwa', 'Webtoon']
            : origLang.startsWith('zh')
            ? ['Manhua']
            : ['Manga'],
        synopsis: String(synopsis).replace(/\r?\n/g, ' ').slice(0, 420),
        availableSources: ['mangadex'],
        primarySource: 'mangadex',
        coverTheme: COVER_THEMES[(idx + 4) % COVER_THEMES.length],
        coverUrl,
        totalChapters: cachedChaps && cachedChaps.length > 0 ? cachedChaps.length : totalChapters,
        chapters: initialChapters,
      });
    }

    if (items.length > 0 && results.length === 0) {
      throw new LiveSourceFailure('parse_error', 'The MangaDex manga list could not be mapped.');
    }
    return results;
  } catch (error) {
    if (params.reportFailures) throw normalizeLiveSourceFailure(error);
    return [];
  }
}

export async function searchMangaDexLive(
  query: string,
  _enabledSources: SourceId[]
): Promise<MangaSeries[]> {
  return browseMangaDexLive({ query, page: 1 });
}

export async function getMangaDexChapterPages(
  mdExternalId: string
): Promise<{ url: string; referer: string }[]> {
  try {
    let chapterUuid = mdExternalId.replace(/^md-ch:/, '');
    if (chapterUuid.startsWith('md-series:')) {
      const parts = chapterUuid.replace(/^md-series:/, '').split(':');
      const mangaUuid = parts[0];
      const targetNum = Number(parts[1]) || 1;
      const chaps = await getMangaDexChapters(mangaUuid);
      const matched =
        chaps.find((c) => c.number === targetNum) || chaps[chaps.length - 1] || chaps[0];
      if (matched?.externalId) {
        chapterUuid = matched.externalId.replace(/^md-ch:/, '');
      }
    }

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(chapterUuid)) return [];

    const res = await fetch(`https://api.mangadex.org/at-home/server/${chapterUuid}`, {
      headers: { 'User-Agent': 'FMD2-Studio/2.0' },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as any;
    const baseUrl = data?.baseUrl;
    const hash = data?.chapter?.hash;
    const files: string[] =
      Array.isArray(data?.chapter?.dataSaver) && data.chapter.dataSaver.length > 0
        ? data.chapter.dataSaver
        : Array.isArray(data?.chapter?.data)
        ? data.chapter.data
        : [];
    const folder =
      Array.isArray(data?.chapter?.dataSaver) && data.chapter.dataSaver.length > 0
        ? 'data-saver'
        : 'data';

    if (!baseUrl || !hash || files.length === 0) return [];

    return files.map((file) => ({
      url: `${baseUrl}/${folder}/${hash}/${file}`,
      referer: 'https://mangadex.org/',
    }));
  } catch {
    return [];
  }
}

// ============================================================================
// 4. LIKEMANGA.LUA LIVE SCRAPER (https://likemanga.ink)
// ============================================================================

export async function browseLikeMangaLive(params: LiveBrowseParams = {}): Promise<MangaSeries[]> {
  try {
    const fetcher = params.fetcher || fetch;
    const page = Math.max(1, params.page || 1);
    const statusParam =
      params.status === 'Completed'
        ? 'complete'
        : params.status === 'Ongoing'
        ? 'ongoing'
        : 'all';
    const sortParam = params.sortBy === 'latest' ? 'lastest-chap' : 'hot';
    const keyword = params.query ? encodeURIComponent(params.query.trim()) : '';

    const searchUrl = `https://likemanga.ink/?act=search&f[status]=${statusParam}&f[sortby]=${sortParam}&f[keyword]=${keyword}&pageNum=${page}`;
    const res = await fetcher(searchUrl, {
      headers: {
        'User-Agent': BROWSER_UA,
        Referer: 'https://likemanga.ink/',
      },
      signal: AbortSignal.timeout(5500),
    });

    if (!res.ok) {
      throw new LiveSourceFailure('http_error', `LikeManga returned HTTP ${res.status}.`);
    }
    const html = await res.text();

    const cardBlocks = html.split(/<div class="col-lg-3 col-md-4 col-sm-4 col-6/i).slice(1);
    if (cardBlocks.length === 0) throwForUnrecognizedEmptyPage('likemanga', html);
    const results: MangaSeries[] = [];
    const seenPaths = new Set<string>();

    for (let idx = 0; idx < cardBlocks.length && results.length < 24; idx++) {
      const cb = cardBlocks[idx];
      const hrefM = cb.match(/href="(\/[^"]+?-\d+\/)"/i);
      if (!hrefM) continue;
      const pathSlug = hrefM[1];
      if (seenPaths.has(pathSlug)) continue;
      seenPaths.add(pathSlug);

      const imgM = cb.match(/<img\s+src="([^"]+)"[^>]*alt="([^"]+)"/i);
      const titleLinkM = cb.match(/class="jtip\s+text-body"[^>]*>([^<]+)<\/a>/i);
      const rawTitle = decodeHtmlEntities(
        (titleLinkM ? titleLinkM[1] : imgM ? imgM[2] : '').replace(/\s+/g, ' ').trim()
      );
      if (!rawTitle || rawTitle.length < 2) continue;

      let rawCover = imgM ? imgM[1] : undefined;
      if (rawCover && !rawCover.startsWith('http')) {
        rawCover = `https://likemanga.ink/${rawCover.replace(/^\/+/, '')}`;
      }
      const coverUrl =
        rawCover && rawCover.startsWith('http')
          ? buildProxiedImageUrl(rawCover, 'https://likemanga.ink/')
          : undefined;

      // Extract real chapter links listed directly inside this LikeManga card
      const cardChapMatches = [
        ...cb.matchAll(/<a\s+href="(\/[^"]+\/chapter-[^"]+)"[^>]*>([^<]+)<\/a>/gi),
      ];
      const cardChapters: MangaChapter[] = [];
      const seenChNums = new Set<number>();
      let highestChapNum = 1;

      for (const cm of cardChapMatches) {
        const chPath = cm[1];
        const chLabel = decodeHtmlEntities(cm[2].replace(/\s+/g, ' ').trim());
        if (!chLabel) continue;
        const numM = chLabel.match(/(\d+(?:\.\d+)?)/) || chPath.match(/chapter-(\d+)/i);
        const chNum = numM ? Number(numM[1]) : cardChapters.length + 1;
        if (chNum > highestChapNum) highestChapNum = chNum;
        if (seenChNums.has(chNum)) continue;
        seenChNums.add(chNum);
        cardChapters.push({
          id: `lm-${pathSlug.replace(/[^a-z0-9]+/gi, '-')}-ch-${chNum}`,
          number: chNum,
          title: chLabel,
          releaseDate: '2026-10-16',
          scanlationGroup: 'LikeManga.ink (LikeManga.lua)',
          pagesCount: 18,
          sourceId: 'likemanga',
          language: 'EN',
          externalId: `lm:${chPath}`,
        });
      }

      if (cardChapters.length === 0) {
        cardChapters.push({
          id: `lm-${pathSlug.replace(/[^a-z0-9]+/gi, '-')}-ch-1`,
          number: 1,
          title: 'Chapter 1',
          releaseDate: '2026-10-16',
          scanlationGroup: 'LikeManga.ink (LikeManga.lua)',
          pagesCount: 18,
          sourceId: 'likemanga',
          language: 'EN',
          externalId: `lm-series:${pathSlug}:1`,
        });
      }

      const ttIdM = cb.match(/data-jtip="#(manga-tooltip-\d+)"/i);
      let genres: string[] = ['Action', 'Fantasy', 'Manhwa'];
      let synopsis = '';
      if (ttIdM) {
        const ttIdx = html.indexOf(`id="${ttIdM[1]}"`);
        if (ttIdx !== -1) {
          const ttChunk = html.slice(ttIdx, ttIdx + 2400);
          const gM = ttChunk.match(/<label>Genres:<\/label>([^<]+)<\/p>/i);
          if (gM) {
            const parsedGenres = gM[1]
              .split(',')
              .map((s) => decodeHtmlEntities(s.trim()))
              .filter(Boolean);
            if (parsedGenres.length > 0) genres = parsedGenres;
          }
          const dM = ttChunk.match(/<div class="box_text">([\s\S]*?)<\/div>/i);
          if (dM) {
            synopsis = stripHtmlTags(dM[1]);
          }
        }
      }

      const genresLower = genres.map((g) => g.toLowerCase());
      const demographic = genresLower.some((g) => g.includes('manhua'))
        ? 'Manhua'
        : genresLower.some((g) => g.includes('manga'))
        ? 'Manga'
        : 'Manhwa';

      const totalChapters = Math.max(cardChapters.length, Math.round(highestChapNum));

      results.push({
        id: `lm-${pathSlug.replace(/[^a-z0-9]+/gi, '-')}`.replace(/-+$/g, ''),
        slug: pathSlug.replace(/^\/|\/$/g, ''),
        title: rawTitle,
        altTitles: [`https://likemanga.ink${pathSlug}`],
        author: 'LikeManga.ink',
        artist: 'LikeManga.ink',
        status: params.status === 'Completed' ? 'Completed' : 'Ongoing',
        year: 2025,
        rating: Number((9.0 - (idx % 8) * 0.08).toFixed(1)),
        demographic,
        genres,
        metadataTags: [demographic, 'Webtoon', 'Long Strip'],
        synopsis:
          synopsis.length > 10
            ? synopsis.slice(0, 420)
            : `${rawTitle} on LikeManga.ink (${cardChapters[0]?.title || 'Latest Release'}).`,
        availableSources: ['likemanga'],
        primarySource: 'likemanga',
        coverTheme: COVER_THEMES[(idx + 2) % COVER_THEMES.length],
        coverUrl,
        totalChapters,
        chapters: cardChapters,
      });
    }

    if (cardBlocks.length > 0 && results.length === 0) {
      throw new LiveSourceFailure('parse_error', 'The LikeManga result cards could not be mapped.');
    }

    return results;
  } catch (error) {
    if (params.reportFailures) throw normalizeLiveSourceFailure(error);
    return [];
  }
}

export async function searchLikeMangaLive(
  query: string,
  _enabledSources: SourceId[]
): Promise<MangaSeries[]> {
  return browseLikeMangaLive({ query, page: 1 });
}

export async function getLikeMangaChapters(
  pathOrTitle: string,
  explicitSlug?: string
): Promise<MangaChapter[]> {
  const key = (explicitSlug || pathOrTitle).toLowerCase();
  const cacheKey = `lm-ch:${key}`;
  const cached = chaptersCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return cached.chapters;
  }

  try {
    let seriesPath = (explicitSlug || pathOrTitle).replace(/^lm-/i, '');
    if (!seriesPath.startsWith('/')) {
      if (/-\d+\/?$/.test(seriesPath)) {
        seriesPath = `/${seriesPath.replace(/^\/|\/$/g, '')}/`;
      } else {
        const searchUrl = `https://likemanga.ink/?act=search&f[status]=all&f[sortby]=lastest-chap&f[keyword]=${encodeURIComponent(
          pathOrTitle
        )}`;
        const sRes = await fetch(searchUrl, {
          headers: { 'User-Agent': BROWSER_UA, Referer: 'https://likemanga.ink/' },
          signal: AbortSignal.timeout(4000),
        });
        if (sRes.ok) {
          const sHtml = await sRes.text();
          const m = sHtml.match(/<a[^>]+href="(\/[^"]+?-\d+\/)"/i);
          if (m) seriesPath = m[1];
        }
      }
    }

    if (!seriesPath.startsWith('/')) return [];

    const res = await fetch(`https://likemanga.ink${seriesPath}`, {
      headers: { 'User-Agent': BROWSER_UA, Referer: 'https://likemanga.ink/' },
      signal: AbortSignal.timeout(4500),
    });
    if (!res.ok) return [];
    const html = await res.text();

    const chRegex = /<a[^>]+href="(\/[^"]+?-\d+\/chapter-[^"]+)"[^>]*>([^<]+)<\/a>/gi;
    const chapters: MangaChapter[] = [];
    const seenNums = new Set<number>();
    let match: RegExpExecArray | null;

    while ((match = chRegex.exec(html)) !== null && chapters.length < 150) {
      const chPath = match[1];
      const rawTitle = decodeHtmlEntities(match[2].replace(/\s+/g, ' ').trim());
      if (!rawTitle) continue;
      const numMatch = rawTitle.match(/(\d+(?:\.\d+)?)/) || chPath.match(/chapter-(\d+)/i);
      const chNum = numMatch ? Number(numMatch[1]) : chapters.length + 1;
      if (seenNums.has(chNum)) continue;
      seenNums.add(chNum);

      chapters.push({
        id: `lm-ch-${chNum}`,
        number: chNum,
        title: rawTitle,
        releaseDate: '2026-10-16',
        scanlationGroup: 'LikeManga.ink (LikeManga.lua)',
        pagesCount: 16,
        sourceId: 'likemanga',
        language: 'EN',
        externalId: `lm:${chPath}`,
      });
    }

    if (chapters.length > 0) {
      chaptersCache.set(cacheKey, {
        expires: Date.now() + 10 * 60 * 1000,
        chapters,
      });
    }
    return chapters;
  } catch {
    return [];
  }
}

export async function getLikeMangaChapterPages(
  lmChapterPath: string
): Promise<{ url: string; referer: string }[]> {
  try {
    let cleanPath = lmChapterPath.replace(/^lm:/, '');
    if (cleanPath.startsWith('lm-series:')) {
      const parts = cleanPath.replace(/^lm-series:/, '').split(':');
      const slugPath = parts[0];
      const targetNum = Number(parts[1]) || 1;
      const chaps = await getLikeMangaChapters(slugPath, slugPath);
      const matched =
        chaps.find((c) => c.number === targetNum) || chaps[chaps.length - 1] || chaps[0];
      if (matched?.externalId) {
        cleanPath = matched.externalId.replace(/^lm:/, '');
      }
    }
    if (!cleanPath.startsWith('/')) return [];

    const res = await fetch(`https://likemanga.ink${cleanPath}`, {
      headers: { 'User-Agent': BROWSER_UA, Referer: 'https://likemanga.ink/' },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const html = await res.text();

    const imgRegex = /<img[^>]+src="(https:\/\/[^"]+\.(?:webp|jpg|jpeg|png)[^"]*)"/gi;
    const pages: { url: string; referer: string }[] = [];
    let match: RegExpExecArray | null;
    while ((match = imgRegex.exec(html)) !== null) {
      const url = match[1];
      if (!url.includes('logo') && !url.includes('avatar') && !url.includes('fav_')) {
        pages.push({ url, referer: 'https://likemanga.ink/' });
      }
    }
    return pages;
  } catch {
    return [];
  }
}

// ============================================================================
// 5. MANGAKATANA.LUA LIVE SCRAPER (https://mangakatana.com)
// ============================================================================

export async function browseMangaKatanaLive(params: LiveBrowseParams = {}): Promise<MangaSeries[]> {
  try {
    const fetcher = params.fetcher || fetch;
    const page = Math.max(1, params.page || 1);
    let targetUrl = `https://mangakatana.com/manga/page/${page}?filter=1&include_mode=and&order=popular`;
    if (params.query && params.query.trim()) {
      targetUrl = `https://mangakatana.com/page/${page}?search=${encodeURIComponent(
        params.query.trim()
      )}&search_by=book_name`;
    } else if (params.sortBy === 'latest') {
      targetUrl = `https://mangakatana.com/latest/page/${page}`;
    } else if (params.sortBy === 'title') {
      targetUrl = `https://mangakatana.com/manga/page/${page}?filter=1&include_mode=and&order=az`;
    }

    const res = await fetcher(targetUrl, {
      headers: {
        'User-Agent': BROWSER_UA,
        Referer: 'https://mangakatana.com/',
      },
      signal: AbortSignal.timeout(5500),
    });

    if (!res.ok) {
      throw new LiveSourceFailure('http_error', `MangaKatana returned HTTP ${res.status}.`);
    }
    const html = await res.text();
    const items = html.split(/<div class="item"\s+data-genre=/i).slice(1);
    if (items.length === 0) throwForUnrecognizedEmptyPage('mangakatana', html);
    const results: MangaSeries[] = [];

    for (let idx = 0; idx < items.length && results.length < 24; idx++) {
      const b = items[idx];
      const linkM = b.match(
        /<h3 class="title">\s*<a href="https:\/\/mangakatana\.com\/manga\/([^"]+)"[^>]*>([^<]+)<\/a>(?:<span>\s*-\s*([^<]+)<\/span>)?/i
      );
      if (!linkM) continue;

      const slug = linkM[1];
      const rawTitle = decodeHtmlEntities(linkM[2].trim());
      if (!rawTitle) continue;
      const chBadge = linkM[3] || '';
      const chNumMatch =
        chBadge.match(/(\d+(?:\.\d+)?)/) ||
        b.match(/\/c(\d+(?:\.\d+)?)"[^>]*>Chapter/i);

      // Extract real chapter links embedded inside the MangaKatana card
      const cardChapMatches = [
        ...b.matchAll(
          /<div class="chapter">\s*<a href="(https:\/\/mangakatana\.com\/manga\/[^"]+\/c(\d+(?:\.\d+)?))"[^>]*>([^<]+)<\/a>/gi
        ),
      ];
      const cardChapters: MangaChapter[] = [];
      const seenChNums = new Set<number>();
      let maxCh = chNumMatch ? Number(chNumMatch[1]) : 1;

      for (const cm of cardChapMatches) {
        const chUrl = cm[1];
        const chNum = Number(cm[2]);
        const chTitle = decodeHtmlEntities(cm[3].trim());
        if (Number.isNaN(chNum) || seenChNums.has(chNum)) continue;
        seenChNums.add(chNum);
        if (chNum > maxCh) maxCh = chNum;
        cardChapters.push({
          id: `mk-${slug.replace(/[^a-z0-9]+/gi, '-')}-ch-${chNum}`,
          number: chNum,
          title: chTitle || `Chapter ${chNum}`,
          releaseDate: '2026-10-16',
          scanlationGroup: 'MangaKatana (MangaKatana.lua)',
          pagesCount: 20,
          sourceId: 'mangakatana',
          language: 'EN',
          externalId: `mk-ch:${chUrl}`,
        });
      }

      if (!seenChNums.has(1)) {
        cardChapters.push({
          id: `mk-${slug.replace(/[^a-z0-9]+/gi, '-')}-ch-1`,
          number: 1,
          title: 'Chapter 1',
          releaseDate: '2024-01-01',
          scanlationGroup: 'MangaKatana (MangaKatana.lua)',
          pagesCount: 20,
          sourceId: 'mangakatana',
          language: 'EN',
          externalId: `mk-ch:https://mangakatana.com/manga/${slug}/c1`,
        });
      }

      const totalChapters = Math.max(cardChapters.length, Math.round(maxCh));

      const imgM =
        b.match(/<source\s+srcset="(https:\/\/[^"]+\.webp)"/i) ||
        b.match(/<img\s+src="(https:\/\/[^"]+)"/i);
      const rawCover = imgM ? imgM[1] : undefined;
      const coverUrl = rawCover
        ? buildProxiedImageUrl(rawCover, 'https://mangakatana.com/')
        : undefined;

      const statusM = b.match(/<div class="status\s+[^"]*"><i[^>]*><\/i>\s*([^<]+)<\/div>/i);
      const rawStatus = statusM ? statusM[1].trim().toLowerCase() : 'ongoing';
      const status: MangaSeries['status'] =
        rawStatus.includes('complete')
          ? 'Completed'
          : rawStatus.includes('hiatus')
          ? 'Hiatus'
          : 'Ongoing';

      const dateM = b.match(/<div class="date">[\s\S]*?(\d{4})<\/div>/i);
      const year = dateM ? Number(dateM[1]) : 2023;

      const genres = [
        ...b.matchAll(/href="https:\/\/mangakatana\.com\/genre\/[^"]+">([^<]+)<\/a>/gi),
      ]
        .map((m) => decodeHtmlEntities(m[1].trim()))
        .filter(Boolean);

      const summaryM = b.match(/<div class="summary[^"]*">([\s\S]*?)<\/div>/i);
      const synopsis = summaryM ? stripHtmlTags(summaryM[1]) : '';

      const genresLower = genres.map((g) => g.toLowerCase());
      const demographic = genresLower.includes('seinen')
        ? 'Seinen'
        : genresLower.includes('shounen')
        ? 'Shounen'
        : genresLower.includes('shoujo')
        ? 'Shoujo'
        : genresLower.includes('josei')
        ? 'Josei'
        : genresLower.some((g) => g.includes('manhwa') || g.includes('webtoon'))
        ? 'Manhwa'
        : genresLower.some((g) => g.includes('manhua'))
        ? 'Manhua'
        : 'Manga';

      results.push({
        id: `mk-${slug.replace(/[^a-z0-9]+/gi, '-')}`,
        slug,
        title: rawTitle,
        altTitles: [`https://mangakatana.com/manga/${slug}`],
        author: 'MangaKatana',
        artist: 'MangaKatana',
        status,
        year,
        rating: Number((9.0 - (idx % 9) * 0.08).toFixed(1)),
        demographic,
        genres: genres.length > 0 ? genres : ['Action', 'Adventure'],
        metadataTags: [demographic],
        synopsis:
          synopsis.length > 10
            ? synopsis.slice(0, 420)
            : `${rawTitle} on MangaKatana (${totalChapters} chapters).`,
        availableSources: ['mangakatana'],
        primarySource: 'mangakatana',
        coverTheme: COVER_THEMES[(idx + 5) % COVER_THEMES.length],
        coverUrl,
        totalChapters,
        chapters: cardChapters,
      });
    }

    if (items.length > 0 && results.length === 0) {
      throw new LiveSourceFailure('parse_error', 'The MangaKatana result cards could not be mapped.');
    }

    return results;
  } catch (error) {
    if (params.reportFailures) throw normalizeLiveSourceFailure(error);
    return [];
  }
}

export async function getMangaKatanaChapters(
  slugOrTitle: string,
  explicitSlug?: string
): Promise<MangaChapter[]> {
  const key = (explicitSlug || slugOrTitle).toLowerCase();
  const cacheKey = `mk-ch:${key}`;
  const cached = chaptersCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return cached.chapters;
  }

  try {
    let slug = explicitSlug || slugOrTitle.replace(/^mk-/i, '');
    if (!/\.\d+$/.test(slug)) {
      // Check if it was a hyphenated id like kanojo-no-carrera-3551 -> convert last -digits to .digits
      const hyphenNumMatch = slug.match(/^(.+)-(\d+)$/);
      if (hyphenNumMatch) {
        slug = `${hyphenNumMatch[1]}.${hyphenNumMatch[2]}`;
      } else {
        const searchList = await browseMangaKatanaLive({ query: slugOrTitle, page: 1 });
        if (searchList.length > 0) {
          slug = searchList[0].slug;
        }
      }
    }
    if (!slug) return [];

    const res = await fetch(`https://mangakatana.com/manga/${slug}`, {
      headers: { 'User-Agent': BROWSER_UA, Referer: 'https://mangakatana.com/' },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const html = await res.text();

    const chRegex =
      /<div class="chapter">\s*<a href="(https:\/\/mangakatana\.com\/manga\/[^"]+\/c(\d+(?:\.\d+)?))"[^>]*>([^<]+)<\/a>(?:[\s\S]*?<div class="update_time">([^<]+)<\/div>)?/gi;
    const chapters: MangaChapter[] = [];
    const seenNums = new Set<number>();
    let match: RegExpExecArray | null;

    while ((match = chRegex.exec(html)) !== null && chapters.length < 300) {
      const chUrl = match[1];
      const chNum = Number(match[2]);
      const rawTitle = decodeHtmlEntities(match[3].trim());
      const rawDate = match[4] ? match[4].trim() : '2026-01-01';
      if (Number.isNaN(chNum) || seenNums.has(chNum)) continue;
      seenNums.add(chNum);

      chapters.push({
        id: `mk-ch-${chNum}`,
        number: chNum,
        title: rawTitle || `Chapter ${chNum}`,
        releaseDate: rawDate,
        scanlationGroup: 'MangaKatana (MangaKatana.lua)',
        pagesCount: 20,
        sourceId: 'mangakatana',
        language: 'EN',
        externalId: `mk-ch:${chUrl}`,
      });
    }

    if (chapters.length > 0) {
      chaptersCache.set(cacheKey, {
        expires: Date.now() + 10 * 60 * 1000,
        chapters,
      });
    }
    return chapters;
  } catch {
    return [];
  }
}

export async function getMangaKatanaChapterPages(
  mkExternalId: string
): Promise<{ url: string; referer: string }[]> {
  try {
    let chUrl = mkExternalId.replace(/^mk-ch:/, '');
    if (chUrl.startsWith('mk-series:')) {
      const parts = chUrl.replace(/^mk-series:/, '').split(':');
      const slug = parts[0];
      const chNum = parts[1] || '1';
      chUrl = `https://mangakatana.com/manga/${slug}/c${chNum}`;
    }
    if (!chUrl.startsWith('https://mangakatana.com/')) return [];

    const res = await fetch(chUrl, {
      headers: { 'User-Agent': BROWSER_UA, Referer: 'https://mangakatana.com/' },
      signal: AbortSignal.timeout(5500),
    });
    if (!res.ok) return [];
    const html = await res.text();

    const thzqMatch = html.match(/var\s+thzq\s*=\s*\[([^\]]+)\]/i);
    if (!thzqMatch) return [];

    const urls = [...thzqMatch[1].matchAll(/['"](https:\/\/[^'"]+)['"]/gi)].map((m) => m[1]);
    return urls.map((url) => ({
      url,
      referer: 'https://mangakatana.com/',
    }));
  } catch {
    return [];
  }
}

// ============================================================================
// UNIFIED LIVE BROWSE & MULTI-SOURCE SEARCH ROUTERS
// ============================================================================

const inFlightBrowse = new Map<string, Promise<LiveBrowseResult>>();

function makeBrowseCacheKey(sourceId: SourceId | 'ALL', params: LiveBrowseParams): string {
  return JSON.stringify({
    s: sourceId,
    q: (params.query || '').trim().toLowerCase(),
    sort: params.sortBy || 'popular',
    st: params.status || 'All',
    fmt: params.format || 'All',
    demo: params.demographic || 'All',
    minCh: params.minChapters || 0,
    p: params.page || 1,
  });
}

function mergeBrowseResults(sourceLists: MangaSeries[][]): MangaSeries[] {
  const byNormTitle = new Map<string, MangaSeries>();
  for (const item of sourceLists.flat()) {
    const norm = item.title.toLowerCase().replace(/[^a-z0-9]+/g, '');
    if (!norm) continue;
    const existing = byNormTitle.get(norm);
    if (existing) {
      existing.availableSources = Array.from(new Set([...existing.availableSources, ...item.availableSources]));
      if (item.chapters.length > existing.chapters.length) {
        existing.chapters = item.chapters;
        existing.totalChapters = Math.max(existing.totalChapters, item.totalChapters);
      }
    } else {
      byNormTitle.set(norm, { ...item, availableSources: Array.from(new Set(item.availableSources)) });
    }
  }
  return Array.from(byNormTitle.values());
}

const adapters = {
  weebcentral: browseWeebCentralLive,
  asurascans: browseAsuraScansLive,
  mangadex: browseMangaDexLive,
  likemanga: browseLikeMangaLive,
  mangakatana: browseMangaKatanaLive,
};

async function queryLiveSource(
  sourceId: SourceId,
  params: LiveBrowseParams,
  timeoutMs: number
): Promise<{ results: MangaSeries[]; sourceOutcome: LiveSourceBrowseOutcome }> {
  const cacheKey = makeBrowseCacheKey(sourceId, params);
  const startedAt = Date.now();
  const fetchedAt = new Date().toISOString();
  const adapter = adapters[sourceId as keyof typeof adapters];

  if (!adapter) {
    return {
      results: [],
      sourceOutcome: {
        sourceId,
        outcome: 'http_error',
        latencyMs: 0,
        resultCount: 0,
        cached: false,
        stale: false,
        fetchedAt,
        message: 'No live adapter is registered for this source.',
      },
    };
  }

  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const results = await Promise.race([
      adapter({ ...params, sourceId, reportFailures: true }),
      new Promise<MangaSeries[]>((_, reject) => {
        timeout = setTimeout(
          () => reject(new LiveSourceFailure('timeout', 'The upstream source timed out.')),
          timeoutMs
        );
      }),
    ]);
    const currentFetchedAt = new Date().toISOString();
    sourceBrowseCache.set(cacheKey, { results, fetchedAt: currentFetchedAt });
    return {
      results,
      sourceOutcome: {
        sourceId,
        outcome: results.length > 0 ? 'success' : 'empty',
        latencyMs: Date.now() - startedAt,
        resultCount: results.length,
        cached: false,
        stale: false,
        fetchedAt: currentFetchedAt,
        message: results.length > 0 ? `Returned ${results.length} series.` : 'No results matched this query.',
      },
    };
  } catch (error) {
    const failure = normalizeLiveSourceFailure(error);
    const stale = sourceBrowseCache.get(cacheKey);
    const staleResults = stale?.results || [];
    return {
      results: staleResults,
      sourceOutcome: {
        sourceId,
        outcome: failure.outcome,
        latencyMs: Date.now() - startedAt,
        resultCount: staleResults.length,
        cached: staleResults.length > 0,
        stale: staleResults.length > 0,
        fetchedAt: stale?.fetchedAt || fetchedAt,
        message:
          staleResults.length > 0
            ? `${failure.message} Showing ${staleResults.length} cached series.`
            : failure.message,
      },
    };
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function browseLiveFmdSources(params: LiveBrowseParams = {}): Promise<LiveBrowseResult> {
  const targetSource = params.sourceId || 'ALL';
  if (targetSource !== 'ALL' && !DEFAULT_ENABLED_SOURCE_IDS.includes(targetSource)) {
    return { results: [], sourcesQueried: [], sourceOutcomes: [] };
  }
  const cacheKey = makeBrowseCacheKey(targetSource, params);

  if (!params.forceRefresh) {
    const cached = browseCache.get(cacheKey);
    if (cached && cached.expires > Date.now()) {
      return {
        ...cached.result,
        sourceOutcomes: cached.result.sourceOutcomes.map((outcome) => ({ ...outcome, cached: true })),
      };
    }

    const existingInFlight = inFlightBrowse.get(cacheKey);
    if (existingInFlight) return existingInFlight;
  }

  const task = (async (): Promise<LiveBrowseResult> => {
    const sourcesQueried =
      targetSource === 'ALL' ? [...DEFAULT_ENABLED_SOURCE_IDS] : [targetSource];
    const sourceResults = await Promise.all(
      sourcesQueried.map((sourceId) =>
        queryLiveSource(sourceId, params, targetSource === 'ALL' ? 2800 : 7000)
      )
    );
    const results = mergeBrowseResults(sourceResults.map((entry) => entry.results));
    const sourceOutcomes = sourceResults.map((entry) => entry.sourceOutcome);
    const result: LiveBrowseResult = { results, sourcesQueried, sourceOutcomes };

    if (results.length > 0) {
      browseCache.set(cacheKey, { expires: Date.now() + 10 * 60 * 1000, result });
    }
    return result;
  })();

  inFlightBrowse.set(cacheKey, task);
  try {
    return await task;
  } finally {
    inFlightBrowse.delete(cacheKey);
  }
}

export async function searchAllLiveFmdSources(
  query: string,
  enabledSources: SourceId[]
): Promise<MangaSeries[]> {
  const qKey = `${query.trim().toLowerCase()}::${enabledSources.join(',')}`;
  const cached = searchCache.get(qKey);
  if (cached && cached.expires > Date.now()) {
    return cached.results;
  }

  const activeSet = new Set(
    enabledSources.length > 0 ? enabledSources : DEFAULT_ENABLED_SOURCE_IDS
  );

  const tasks: Promise<MangaSeries[]>[] = [];
  if (activeSet.has('weebcentral')) tasks.push(searchWeebCentralLive(query, enabledSources));
  if (activeSet.has('asurascans')) tasks.push(browseAsuraScansLive({ query, page: 1 }));
  if (activeSet.has('mangadex')) tasks.push(searchMangaDexLive(query, enabledSources));
  if (activeSet.has('likemanga')) tasks.push(searchLikeMangaLive(query, enabledSources));
  if (activeSet.has('mangakatana')) tasks.push(browseMangaKatanaLive({ query, page: 1 }));

  const batches = await Promise.all(tasks);
  const byNormTitle = new Map<string, MangaSeries>();

  for (const batch of batches) {
    for (const item of batch) {
      const norm = item.title.toLowerCase().replace(/[^a-z0-9]+/g, '');
      if (!norm) continue;
      const existing = byNormTitle.get(norm);
      if (existing) {
        existing.availableSources = Array.from(
          new Set([...existing.availableSources, ...item.availableSources])
        );
        if (item.chapters.length > existing.chapters.length) {
          existing.chapters = item.chapters;
          existing.totalChapters = Math.max(existing.totalChapters, item.totalChapters);
        }
      } else {
        byNormTitle.set(norm, { ...item });
      }
    }
  }

  const merged = Array.from(byNormTitle.values());
  if (merged.length > 0) {
    searchCache.set(qKey, {
      expires: Date.now() + 5 * 60 * 1000,
      results: merged,
    });
  }

  return merged;
}

/**
 * Resolves live chapters for a series from the selected source
 */
export async function resolveLiveChaptersForSeries(
  seriesTitle: string,
  sourceId: SourceId,
  seriesSlugOrId?: string,
  seriesSlug?: string
): Promise<MangaChapter[]> {
  if (!DEFAULT_ENABLED_SOURCE_IDS.includes(sourceId)) return [];

  if (sourceId === 'asurascans') {
    const asChaps = await getAsuraScansChapters(seriesSlugOrId || seriesTitle, seriesSlug);
    if (asChaps.length > 0) return asChaps;
  } else if (sourceId === 'mangadex') {
    const mdChaps = await getMangaDexChapters(seriesSlugOrId || seriesTitle);
    if (mdChaps.length > 0) return mdChaps;
  } else if (sourceId === 'likemanga') {
    const lmChaps = await getLikeMangaChapters(seriesSlugOrId || seriesTitle, seriesSlug);
    if (lmChaps.length > 0) return lmChaps;
  } else if (sourceId === 'mangakatana') {
    const mkChaps = await getMangaKatanaChapters(seriesSlugOrId || seriesTitle, seriesSlug);
    if (mkChaps.length > 0) return mkChaps;
  }

  const wcQuery =
    seriesSlugOrId && seriesSlugOrId.startsWith('wc-')
      ? seriesSlugOrId.replace(/^wc-/i, '').toUpperCase()
      : seriesTitle;
  const wcChaps = await getWeebCentralChapters(wcQuery);
  if (wcChaps.length > 0) {
    const mod = ALL_FMD2_SOURCES.find((m) => m.id === sourceId);
    return wcChaps.map((c) => ({
      ...c,
      sourceId,
      scanlationGroup: mod ? `${mod.name} (${mod.luaModule})` : c.scanlationGroup,
    }));
  }

  return [];
}

/**
 * Resolves live chapter page images for reading or CBZ/ZIP archive packaging
 */
export async function resolveLiveChapterPages(params: {
  seriesTitle: string;
  chapterNumber: number;
  sourceId: SourceId;
  externalId?: string;
}): Promise<LiveChapterPageResult> {
  const mod =
    ALL_FMD2_SOURCES.find((m) => m.id === params.sourceId) ||
    ALL_FMD2_SOURCES.find((m) => m.id === 'weebcentral')!;
  if (!DEFAULT_ENABLED_SOURCE_IDS.includes(params.sourceId)) {
    return {
      sourceId: params.sourceId,
      luaModule: mod.luaModule,
      chapterTitle: `Chapter ${params.chapterNumber}`,
      pages: [],
      rawUpstreamPages: [],
    };
  }

  const cacheKey = `${params.seriesTitle.toLowerCase()}::${params.chapterNumber}::${params.sourceId}::${
    params.externalId || ''
  }`;
  const cached = pagesCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return cached.data;
  }

  let rawUpstreamPages: { url: string; referer: string }[] = [];

  // 1. Direct externalId fast-path
  if (params.externalId) {
    if (params.externalId.startsWith('wc:')) {
      rawUpstreamPages = await getWeebCentralChapterPages(params.externalId);
    } else if (params.externalId.startsWith('wc-series:')) {
      const parts = params.externalId.replace(/^wc-series:/, '').split(':');
      const wcSeriesId = parts[0];
      const wcChaps = await getWeebCentralChapters(wcSeriesId);
      const target =
        wcChaps.find((c) => c.number === params.chapterNumber) ||
        wcChaps[wcChaps.length - 1] ||
        wcChaps[0];
      if (target?.externalId) {
        rawUpstreamPages = await getWeebCentralChapterPages(target.externalId);
      }
    } else if (
      params.externalId.startsWith('as-ch:') ||
      params.externalId.startsWith('as-series:')
    ) {
      rawUpstreamPages = await getAsuraScansChapterPages(params.externalId);
    } else if (
      params.externalId.startsWith('md-ch:') ||
      params.externalId.startsWith('md-series:')
    ) {
      rawUpstreamPages = await getMangaDexChapterPages(params.externalId);
    } else if (
      params.externalId.startsWith('lm:') ||
      params.externalId.startsWith('lm-series:')
    ) {
      rawUpstreamPages = await getLikeMangaChapterPages(params.externalId);
    } else if (
      params.externalId.startsWith('mk-ch:') ||
      params.externalId.startsWith('mk-series:')
    ) {
      rawUpstreamPages = await getMangaKatanaChapterPages(params.externalId);
    }
  }

  // 2. Source-specific chapter list resolution if externalId wasn't provided or yielded 0 pages
  if (rawUpstreamPages.length === 0) {
    if (params.sourceId === 'asurascans') {
      const chaps = await getAsuraScansChapters(params.seriesTitle);
      const target =
        chaps.find((c) => c.number === params.chapterNumber) ||
        chaps[chaps.length - 1] ||
        chaps[0];
      if (target?.externalId) {
        rawUpstreamPages = await getAsuraScansChapterPages(target.externalId);
      }
    } else if (params.sourceId === 'mangadex') {
      const chaps = await getMangaDexChapters(params.seriesTitle);
      const target =
        chaps.find((c) => c.number === params.chapterNumber) ||
        chaps[chaps.length - 1] ||
        chaps[0];
      if (target?.externalId) {
        rawUpstreamPages = await getMangaDexChapterPages(target.externalId);
      }
    } else if (params.sourceId === 'likemanga') {
      const chaps = await getLikeMangaChapters(params.seriesTitle);
      const target =
        chaps.find((c) => c.number === params.chapterNumber) ||
        chaps[chaps.length - 1] ||
        chaps[0];
      if (target?.externalId) {
        rawUpstreamPages = await getLikeMangaChapterPages(target.externalId);
      }
    } else if (params.sourceId === 'mangakatana') {
      const chaps = await getMangaKatanaChapters(params.seriesTitle);
      const target =
        chaps.find((c) => c.number === params.chapterNumber) ||
        chaps[chaps.length - 1] ||
        chaps[0];
      if (target?.externalId) {
        rawUpstreamPages = await getMangaKatanaChapterPages(target.externalId);
      }
    }

    // Fallback to WeebCentral if the series is hosted there
    if (rawUpstreamPages.length === 0) {
      const wcChaps = await getWeebCentralChapters(params.seriesTitle);
      const target =
        wcChaps.find((c) => c.number === params.chapterNumber) ||
        wcChaps[wcChaps.length - 1] ||
        wcChaps[0];
      if (target?.externalId) {
        rawUpstreamPages = await getWeebCentralChapterPages(target.externalId);
      }
    }
  }

  const proxiedPages = rawUpstreamPages.map((p) => buildProxiedImageUrl(p.url, p.referer));

  const result: LiveChapterPageResult = {
    sourceId: params.sourceId,
    luaModule: mod.luaModule,
    chapterTitle: `Chapter ${params.chapterNumber}`,
    pages: proxiedPages,
    rawUpstreamPages,
  };

  if (proxiedPages.length > 0) {
    pagesCache.set(cacheKey, {
      expires: Date.now() + 15 * 60 * 1000,
      data: result,
    });
  }

  return result;
}

/**
 * Verifies real live HTTP connectivity to the enabled FMD2 sources
 */
export async function verifyFmd2Connectors(
  sourceIds: SourceId[] = DEFAULT_ENABLED_SOURCE_IDS
): Promise<ConnectorHealthStatus[]> {
  const targets = sourceIds
    .map((id) => ALL_FMD2_SOURCES.find((s) => s.id === id))
    .filter((s): s is NonNullable<typeof s> => Boolean(s));

  const checks = await Promise.all(
    targets.map(async (src): Promise<ConnectorHealthStatus> => {
      const start = Date.now();
      try {
        const testUrl =
          src.id === 'mangadex'
            ? 'https://api.mangadex.org/ping'
            : `https://${src.domain}`;
        const res = await fetch(testUrl, {
          method: 'GET',
          headers: { 'User-Agent': BROWSER_UA },
          signal: AbortSignal.timeout(4500),
        });
        const latencyMs = Date.now() - start;

        return {
          sourceId: src.id,
          name: src.name,
          luaModule: src.luaModule,
          domain: src.domain,
          online: res.ok,
          statusCode: res.status,
          latencyMs,
          mode: 'Direct Scraper',
          message: res.ok
            ? `${src.luaModule} connected (${res.status} OK in ${latencyMs}ms)`
            : `${src.luaModule} returned HTTP ${res.status} (${latencyMs}ms)`,
        };
      } catch (err: any) {
        const latencyMs = Date.now() - start;
        return {
          sourceId: src.id,
          name: src.name,
          luaModule: src.luaModule,
          domain: src.domain,
          online: false,
          statusCode: 503,
          latencyMs,
          mode: 'Direct Scraper',
          message: `${src.luaModule} unreachable (${err?.message || 'timeout'})`,
        };
      }
    })
  );

  return checks;
}
