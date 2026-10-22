import {
  ALL_FMD2_SOURCES,
  DEFAULT_ENABLED_SOURCE_IDS,
  FMD2_SOURCE_MAP,
  type SourceId,
  type FmdSourceModule,
} from '../data/fmd2SourcesRegistry.ts';

export {
  ALL_FMD2_SOURCES,
  DEFAULT_ENABLED_SOURCE_IDS,
  FMD2_SOURCE_MAP,
  type SourceId,
  type FmdSourceModule,
};
export const FMD2_SOURCE_MODULES: FmdSourceModule[] = ALL_FMD2_SOURCES;

export type ArchiveFormat = 'CBZ' | 'ZIP';

export type LiveSourceBrowseOutcomeKind =
  | 'success'
  | 'empty'
  | 'timeout'
  | 'http_error'
  | 'network_error'
  | 'parse_error'
  | 'unsupported';

export interface LiveSourceBrowseOutcome {
  sourceId: SourceId;
  outcome: LiveSourceBrowseOutcomeKind;
  latencyMs: number;
  resultCount: number;
  cached: boolean;
  stale: boolean;
  fetchedAt?: string;
  message: string;
}

export function isArchiveFormat(value: unknown): value is ArchiveFormat {
  return value === 'CBZ' || value === 'ZIP';
}

export type ReadingMode =
  | 'single'
  | 'double'
  | 'webtoon'
  | 'vertical-paged'
  | 'horizontal-strip';
export type ReadingDirection = 'rtl' | 'ltr';
export type ReaderFitMode = 'fit-width' | 'fit-height' | 'original';

export interface ReadingModeDefinition {
  id: ReadingMode;
  label: string;
  shortLabel: string;
  description: string;
  isPaginated: boolean;
  bestFor: string;
}

export const READING_MODES_META: ReadingModeDefinition[] = [
  {
    id: 'single',
    label: 'Page-by-Page (Manga)',
    shortLabel: 'Page-by-Page',
    description: 'Classic single-page turns with RTL/LTR tap zones and keyboard navigation.',
    isPaginated: true,
    bestFor: 'Standard Manga & Comics',
  },
  {
    id: 'webtoon',
    label: 'Continuous Scroll (Webtoon)',
    shortLabel: 'Webtoon Scroll',
    description: 'Seamless vertical long-strip scrolling with zero-gap stitch & auto-scroll.',
    isPaginated: false,
    bestFor: 'Manhwa, Webtoons & Long-Strip',
  },
  {
    id: 'double',
    label: 'Double Spread (Book)',
    shortLabel: 'Double Spread',
    description: 'Two-page side-by-side tankobon layout with optional cover page offset.',
    isPaginated: true,
    bestFor: 'Wide Desktop & Tankobon Spreads',
  },
  {
    id: 'vertical-paged',
    label: 'Vertical Page-by-Page',
    shortLabel: 'Vertical Paged',
    description: 'Single-page vertical stepping using Up/Down keys or vertical controls.',
    isPaginated: true,
    bestFor: 'Vertical Paged Reading',
  },
  {
    id: 'horizontal-strip',
    label: 'Horizontal Filmstrip',
    shortLabel: 'Horizontal Strip',
    description: 'Continuous horizontal side-by-side filmstrip scroll with snap alignment.',
    isPaginated: false,
    bestFor: 'Panoramic Horizontal Scroll',
  },
];

export const DEFAULT_WEBTOON_TRIGGER_TAGS: string[] = [
  'Manhwa',
  'Manhua',
  'Webtoon',
  'Long Strip',
  'Vertical Scroll',
  'Full Color',
  'Dungeon',
  'Reincarnation',
  'Regression',
  'System',
  'Murim',
  'Cultivation',
];

export interface ReadingModeResolution {
  mode: ReadingMode;
  direction: ReadingDirection;
  isAutoDetected: boolean;
  matchedCategory: 'webtoon' | 'manga' | 'manual';
  matchedTags: string[];
  allSeriesTags: string[];
  reasonSummary: string;
}

export function getSeriesAllTags(
  series: Pick<MangaSeries, 'demographic' | 'genres'> & { metadataTags?: string[] }
): string[] {
  const raw: string[] = [];
  if (series.demographic) {
    raw.push(series.demographic);
    const demoLower = series.demographic.toLowerCase();
    if (
      demoLower.includes('manhwa') ||
      demoLower.includes('manhua') ||
      demoLower.includes('webtoon')
    ) {
      raw.push('Webtoon', 'Long Strip', 'Full Color');
    } else if (
      demoLower.includes('seinen') ||
      demoLower.includes('shounen') ||
      demoLower.includes('shonen') ||
      demoLower.includes('shoujo') ||
      demoLower.includes('josei')
    ) {
      raw.push('Traditional Manga', 'Tankobon');
    }
  }
  if (Array.isArray(series.genres)) {
    raw.push(...series.genres);
  }
  if (Array.isArray(series.metadataTags)) {
    raw.push(...series.metadataTags);
  }
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const tag of raw) {
    const clean = tag.trim();
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(clean);
    }
  }
  return deduped;
}

export function resolveSeriesReadingMode(
  series: Pick<MangaSeries, 'demographic' | 'genres'> & { metadataTags?: string[] },
  config?: Partial<
    Pick<FmdEngineConfig, 'autoDetectReadingMode' | 'defaultReadingMode' | 'webtoonTriggerTags'>
  >
): ReadingModeResolution {
  const autoDetect = config?.autoDetectReadingMode !== false;
  const fallbackMode: ReadingMode = config?.defaultReadingMode || 'single';
  const triggerTags = Array.isArray(config?.webtoonTriggerTags)
    ? config.webtoonTriggerTags
    : DEFAULT_WEBTOON_TRIGGER_TAGS;

  const allSeriesTags = getSeriesAllTags(series);

  if (!autoDetect) {
    const fallbackDirection: ReadingDirection = fallbackMode === 'webtoon' ? 'ltr' : 'rtl';
    const modeLabel =
      READING_MODES_META.find((m) => m.id === fallbackMode)?.label || fallbackMode;
    return {
      mode: fallbackMode,
      direction: fallbackDirection,
      isAutoDetected: false,
      matchedCategory: 'manual',
      matchedTags: [],
      allSeriesTags,
      reasonSummary: `Auto-toggle disabled · Using manual default (${modeLabel})`,
    };
  }

  const triggerSet = new Set(triggerTags.map((t) => t.trim().toLowerCase()));
  const matchedWebtoonTags = allSeriesTags.filter((tag) =>
    triggerSet.has(tag.trim().toLowerCase())
  );

  if (matchedWebtoonTags.length > 0) {
    return {
      mode: 'webtoon',
      direction: 'ltr',
      isAutoDetected: true,
      matchedCategory: 'webtoon',
      matchedTags: matchedWebtoonTags,
      allSeriesTags,
      reasonSummary: `Auto: Continuous Scroll (Webtoon) · Matched [${matchedWebtoonTags
        .slice(0, 3)
        .join(', ')}]`,
    };
  }

  const mangaTags = allSeriesTags.slice(0, 3);
  return {
    mode: 'single',
    direction: 'rtl',
    isAutoDetected: true,
    matchedCategory: 'manga',
    matchedTags: mangaTags,
    allSeriesTags,
    reasonSummary: `Auto: Page-by-Page (Manga) · Matched [${mangaTags.join(', ')}]`,
  };
}

export function getDefaultReadingModeForSeries(
  series: Pick<MangaSeries, 'demographic' | 'genres'> & { metadataTags?: string[] },
  config?: Partial<
    Pick<FmdEngineConfig, 'autoDetectReadingMode' | 'defaultReadingMode' | 'webtoonTriggerTags'>
  >
): ReadingMode {
  return resolveSeriesReadingMode(series, config).mode;
}

export interface MangaChapter {
  id: string;
  number: number;
  title: string;
  volume?: string;
  releaseDate: string;
  scanlationGroup: string;
  pagesCount: number;
  sourceId: SourceId;
  language: string;
  externalId?: string;
}

export interface MangaSeries {
  id: string;
  slug: string;
  title: string;
  altTitles: string[];
  author: string;
  artist: string;
  status: 'Ongoing' | 'Completed' | 'Hiatus';
  year: number;
  rating: number;
  demographic: string;
  genres: string[];
  metadataTags?: string[];
  synopsis: string;
  availableSources: SourceId[];
  primarySource: SourceId;
  coverTheme:
    | 'shadow-monarch'
    | 'eclipse-berserk'
    | 'omniscient-star'
    | 'ronin-ink'
    | 'cyber-blame'
    | 'chainsaw-devil'
    | 'frieren-mage'
    | 'dungeon-feast';
  coverUrl?: string;
  totalChapters: number;
  chapters: MangaChapter[];
}

export interface DownloadTask {
  id: string;
  mangaId: string;
  mangaTitle: string;
  chapterId: string;
  chapterNumber: number;
  chapterTitle: string;
  externalId?: string;
  sourceId: SourceId;
  luaModule: string;
  format: ArchiveFormat;
  status: 'downloading' | 'queued' | 'paused' | 'completed' | 'failed';
  progress: number;
  pagesDownloaded: number;
  totalPages: number;
  speedKbps: number;
  sizeMb: number;
  addedAt: string;
  savePath: string;
  archiveReady?: boolean;
  bytesWritten?: number;
  lastLog?: string;
}

export interface FmdEngineConfig {
  maxConcurrentTasks: number;
  maxThreadsPerTask: number;
  includeComicInfoXml: boolean;
  defaultFormat: ArchiveFormat;
  saveDirectory: string;
  autoDownloadToBrowser: boolean;
  enabledSources: SourceId[];
  autoDetectReadingMode?: boolean;
  defaultReadingMode?: ReadingMode;
  webtoonTriggerTags?: string[];
}

export interface ParsedFmdUrl {
  isValid: boolean;
  sourceId: SourceId | null;
  luaModule: string | null;
  extractedQuery: string;
  normalizedUrl: string;
  error?: string;
}

export function parseFmdDirectUrl(rawInput: string): ParsedFmdUrl {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return {
      isValid: false,
      sourceId: null,
      luaModule: null,
      extractedQuery: '',
      normalizedUrl: '',
      error: 'Please enter a valid manga URL from a supported FMD2 source.',
    };
  }

  let urlObj: URL;
  try {
    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    urlObj = new URL(withProtocol);
  } catch {
    return {
      isValid: false,
      sourceId: null,
      luaModule: null,
      extractedQuery: '',
      normalizedUrl: '',
      error: 'Invalid URL syntax. Example: https://likemanga.ink/manga/solo-leveling',
    };
  }

  const host = urlObj.hostname.toLowerCase().replace(/^www\./, '');
  const pathSegments = urlObj.pathname
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean);

  let matchedSource = ALL_FMD2_SOURCES.find(
    (m) =>
      host === m.domain ||
      host.endsWith(`.${m.domain}`) ||
      host.includes(m.domain.split('.')[0]) ||
      host.includes(m.id)
  );

  if (!matchedSource) {
    if (host.includes('likemanga')) {
      matchedSource = ALL_FMD2_SOURCES.find((m) => m.id === 'likemanga');
    } else if (host.includes('weebcentral')) {
      matchedSource = ALL_FMD2_SOURCES.find((m) => m.id === 'weebcentral');
    } else if (host.includes('asura')) {
      matchedSource = ALL_FMD2_SOURCES.find((m) => m.id === 'asurascans');
    } else if (host.includes('mangadex')) {
      matchedSource = ALL_FMD2_SOURCES.find((m) => m.id === 'mangadex');
    } else if (host.includes('mangakatana')) {
      matchedSource = ALL_FMD2_SOURCES.find((m) => m.id === 'mangakatana');
    }
  }

  const titleParam = urlObj.searchParams.get('title') || urlObj.searchParams.get('q');
  let slugCandidate = titleParam || '';

  if (!slugCandidate && pathSegments.length > 0) {
    const nonUuidSegments = pathSegments.filter(
      (seg) =>
        ![
          'title',
          'manga',
          'comic',
          'comics',
          'series',
          'en',
          'titles',
          'viewer',
          'list',
          'read',
          'chapters',
        ].includes(seg.toLowerCase()) &&
        !/^[0-9a-f]{8}-[0-9a-f]{4}/i.test(seg) &&
        !/^\d+$/.test(seg) &&
        !/^[0-9A-Z]{20,}$/i.test(seg)
    );
    slugCandidate =
      nonUuidSegments[nonUuidSegments.length - 1] || pathSegments[pathSegments.length - 1];
  }

  const cleanedQuery = slugCandidate
    .replace(/[-_]+/g, ' ')
    .replace(/\b[0-9a-f]{8,}\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!matchedSource) {
    if (cleanedQuery.length >= 2) {
      return {
        isValid: true,
        sourceId: 'likemanga',
        luaModule: 'lua/modules/LikeManga.lua',
        extractedQuery: cleanedQuery,
        normalizedUrl: urlObj.toString(),
      };
    }
    return {
      isValid: false,
      sourceId: null,
      luaModule: null,
      extractedQuery: '',
      normalizedUrl: urlObj.toString(),
      error: 'Could not detect a manga slug in this URL.',
    };
  }

  return {
    isValid: true,
    sourceId: matchedSource.id,
    luaModule: matchedSource.luaModule,
    extractedQuery: cleanedQuery || 'Solo Leveling',
    normalizedUrl: urlObj.toString(),
  };
}

/**
 * Normalizes search text to handle spelling variations ("levelling" vs "leveling"),
 * punctuation ("omniscient reader's" vs "omniscient readers"), and trailing chapter numbers.
 */
export function normalizeSearchText(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(?:ch|chap|chapter|ep|episode)\.?\s*\d+.*$/i, '')
    .replace(/['’`".:;!?()[\]{}/\\|-]+/g, ' ')
    .replace(/levelling/g, 'leveling')
    .replace(/travelling/g, 'traveling')
    .replace(/berzerk/g, 'berserk')
    .replace(/jujustu/g, 'jujutsu')
    .replace(/armour/g, 'armor')
    .replace(/colour/g, 'color')
    .replace(/shounen/g, 'shonen')
    .replace(/shoujo/g, 'shojo')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Bounded Levenshtein edit distance for typo-tolerant search matching.
 */
export function computeEditDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  if (Math.abs(a.length - b.length) > 4) return 99;

  const matrix: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[a.length][b.length];
}

export function seriesSupportsSource(series: MangaSeries, sourceId: SourceId): boolean {
  if (series.primarySource === sourceId || series.availableSources.includes(sourceId)) {
    return true;
  }
  if (DEFAULT_ENABLED_SOURCE_IDS.includes(sourceId)) {
    return false;
  }
  return FMD2_SOURCE_MAP.has(sourceId);
}

/**
 * Returns the list of FMD2 sources available for a series, including any extra
 * compatible connectors the user has enabled in Settings.
 */
export function getEffectiveSeriesSources(
  series: MangaSeries,
  enabledSources: SourceId[]
): SourceId[] {
  const result = new Set<SourceId>(series.availableSources);
  for (const srcId of enabledSources) {
    if (seriesSupportsSource(series, srcId)) {
      result.add(srcId);
    }
  }
  // Order enabled sources first so the user sees their active sources prominently
  const enabledSet = new Set(enabledSources);
  return Array.from(result).sort((a, b) => {
    const aEnabled = enabledSet.has(a) ? 0 : 1;
    const bEnabled = enabledSet.has(b) ? 0 : 1;
    return aEnabled - bEnabled;
  });
}

const SEARCH_STOP_WORDS = new Set([
  'the',
  'a',
  'an',
  'of',
  'in',
  'on',
  'to',
  'for',
  'with',
  'and',
  'or',
  'by',
  'at',
  'from',
]);

/**
 * Computes a relevance score (>= 0) for how well a MangaSeries matches a search query.
 * Supports exact matches, altTitles/acronyms, multi-token out-of-order matches,
 * prefix matches, author matches, and typo-tolerant fuzzy matches on titles.
 */
export function scoreMangaSearchMatch(series: MangaSeries, rawQuery: string): number {
  const normQuery = normalizeSearchText(rawQuery);
  if (!normQuery) return 1;

  const normTitle = normalizeSearchText(series.title);
  const normAlts = series.altTitles.map(normalizeSearchText);
  const normAuthor = normalizeSearchText(`${series.author} ${series.artist}`);

  // 1. Direct / Exact / Prefix / Substring Title & AltTitle Match
  if (normTitle === normQuery) return 1000;
  if (normAlts.some((alt) => alt === normQuery)) return 950;
  if (normTitle.startsWith(normQuery)) return 850;
  if (normTitle.includes(normQuery)) return 750;
  if (normAlts.some((alt) => alt.startsWith(normQuery))) return 720;
  if (normAlts.some((alt) => alt.includes(normQuery))) return 680;
  if (normAuthor.includes(normQuery) && normQuery.length >= 3) return 620;

  // 2. Tokenized & Typo-Tolerant Title/AltTitle/Author Matching
  const rawTokens = normQuery.split(' ').filter(Boolean);
  const meaningfulTokens = rawTokens.filter((t) => !SEARCH_STOP_WORDS.has(t));
  const queryTokens = meaningfulTokens.length > 0 ? meaningfulTokens : rawTokens;

  const titleWords = normTitle.split(' ').filter(Boolean);
  const altWords = normAlts.flatMap((a) => a.split(' ')).filter(Boolean);
  const authorWords = normAuthor.split(' ').filter(Boolean);
  const titleAndAltWords = [...titleWords, ...altWords];

  let matchedTokens = 0;
  let titleOrAltMatchedTokens = 0;
  let tokenScoreSum = 0;

  for (const qToken of queryTokens) {
    if (titleWords.some((tw) => tw === qToken)) {
      matchedTokens++;
      titleOrAltMatchedTokens++;
      tokenScoreSum += 160;
      continue;
    }
    if (
      titleWords.some(
        (tw) => tw.startsWith(qToken) || (qToken.length >= 3 && tw.includes(qToken))
      )
    ) {
      matchedTokens++;
      titleOrAltMatchedTokens++;
      tokenScoreSum += 130;
      continue;
    }
    if (
      altWords.some(
        (aw) => aw === qToken || aw.startsWith(qToken) || (qToken.length >= 3 && aw.includes(qToken))
      )
    ) {
      matchedTokens++;
      titleOrAltMatchedTokens++;
      tokenScoreSum += 115;
      continue;
    }
    if (
      authorWords.some(
        (au) => au === qToken || (qToken.length >= 4 && au.startsWith(qToken))
      )
    ) {
      matchedTokens++;
      tokenScoreSum += 90;
      continue;
    }
    if (qToken.length >= 5) {
      let bestDist = 99;
      for (const candidate of titleAndAltWords) {
        if (
          candidate[0] === qToken[0] &&
          Math.abs(candidate.length - qToken.length) <= 1
        ) {
          const dist = computeEditDistance(qToken, candidate);
          if (dist < bestDist) bestDist = dist;
        }
      }
      if (bestDist <= 1) {
        matchedTokens++;
        titleOrAltMatchedTokens++;
        tokenScoreSum += 80;
      }
    }
  }

  const minRequired =
    queryTokens.length <= 2 ? queryTokens.length : Math.ceil(queryTokens.length * 0.75);
  if (
    matchedTokens >= minRequired &&
    matchedTokens > 0 &&
    (titleOrAltMatchedTokens > 0 || matchedTokens === queryTokens.length)
  ) {
    return tokenScoreSum + matchedTokens * 25;
  }

  // 3. Whole-title edit distance fallback for single-string typos (e.g. "sololeveling")
  const compactQuery = normQuery.replace(/\s+/g, '');
  const compactTitle = normTitle.replace(/\s+/g, '');
  if (compactQuery.length >= 4 && compactTitle.includes(compactQuery)) {
    return 600;
  }
  const wholeDist = computeEditDistance(compactQuery, compactTitle);
  if (
    compactQuery.length >= 5 &&
    compactTitle[0] === compactQuery[0] &&
    wholeDist <= 1
  ) {
    return 500 - wholeDist * 50;
  }

  return 0;
}

/**
 * Queries multiple manga sources simultaneously by title, altTitle, author, genre, or synopsis
 * with typo tolerance, and filters by active source modules.
 */
export function filterAndRankMangaCatalog(
  catalog: MangaSeries[],
  searchQuery: string,
  selectedSources: SourceId[],
  selectedGenre: string = 'All'
): MangaSeries[] {
  const hasQuery = searchQuery.trim().length > 0;
  const scored: { series: MangaSeries; score: number }[] = [];

  for (const series of catalog) {
    if (selectedSources.length > 0) {
      const hasMatchingSource = selectedSources.some((srcId) =>
        seriesSupportsSource(series, srcId)
      );
      if (!hasMatchingSource) continue;
    }

    if (selectedGenre && selectedGenre !== 'All') {
      const matchesGenre =
        series.genres.some((g) => g.toLowerCase() === selectedGenre.toLowerCase()) ||
        series.demographic.toLowerCase() === selectedGenre.toLowerCase();
      if (!matchesGenre) continue;
    }

    if (!hasQuery) {
      scored.push({ series, score: series.rating });
      continue;
    }

    const matchScore = scoreMangaSearchMatch(series, searchQuery);
    if (matchScore > 0) {
      scored.push({ series, score: matchScore + series.rating });
    }
  }

  return scored.sort((a, b) => b.score - a.score).map((item) => item.series);
}

/**
 * Filters the FMD2 Source Catalogue in Settings by search query, category, language, and enabled state.
 */
export function filterFmdSourcesCatalogue(
  sources: FmdSourceModule[],
  searchQuery: string,
  categoryFilter: string = 'All',
  languageFilter: string = 'All',
  statusFilter: 'all' | 'enabled' | 'disabled' = 'all',
  enabledIds: SourceId[] = DEFAULT_ENABLED_SOURCE_IDS
): FmdSourceModule[] {
  const enabledSet = new Set(enabledIds);
  const q = searchQuery.trim().toLowerCase();

  return sources.filter((src) => {
    const isEnabled = enabledSet.has(src.id);
    if (statusFilter === 'enabled' && !isEnabled) return false;
    if (statusFilter === 'disabled' && isEnabled) return false;

    if (categoryFilter && categoryFilter !== 'All' && src.category !== categoryFilter) {
      return false;
    }

    if (languageFilter && languageFilter !== 'All' && src.language !== languageFilter) {
      return false;
    }

    if (!q) return true;

    return (
      src.name.toLowerCase().includes(q) ||
      src.domain.toLowerCase().includes(q) ||
      src.id.toLowerCase().includes(q) ||
      src.luaModule.toLowerCase().includes(q) ||
      src.template.toLowerCase().includes(q) ||
      src.category.toLowerCase().includes(q)
    );
  });
}

export function parseChapterRangeExpression(
  expression: string,
  availableChapterNumbers?: number[]
): Set<number> {
  const result = new Set<number>();
  const trimmed = expression.trim();
  if (!trimmed) return result;

  const maxAvailable =
    availableChapterNumbers && availableChapterNumbers.length > 0
      ? Math.max(...availableChapterNumbers)
      : 500;
  const minAvailable =
    availableChapterNumbers && availableChapterNumbers.length > 0
      ? Math.min(...availableChapterNumbers)
      : 1;

  const parts = trimmed.split(/[,;]+/);
  for (const part of parts) {
    const token = part.trim();
    if (!token) continue;

    // Open-ended upward range: e.g. "3+" or "3-*" or "3-"
    const openUpMatch = token.match(/^(\d+(?:\.\d+)?)\s*(?:\+|-\s*\*?)$/);
    if (openUpMatch) {
      const start = Number(openUpMatch[1]);
      if (!Number.isNaN(start)) {
        if (availableChapterNumbers && availableChapterNumbers.length > 0) {
          for (const n of availableChapterNumbers) {
            if (n >= start) result.add(n);
          }
        } else {
          const floorStart = Math.floor(start);
          for (let i = floorStart; i <= Math.min(maxAvailable, floorStart + 500); i++) {
            result.add(i);
          }
        }
      }
      continue;
    }

    // Open-ended downward range: e.g. "-5" or "*-5"
    const openDownMatch = token.match(/^(?:\*\s*)?-\s*(\d+(?:\.\d+)?)$/);
    if (openDownMatch) {
      const end = Number(openDownMatch[1]);
      if (!Number.isNaN(end)) {
        if (availableChapterNumbers && availableChapterNumbers.length > 0) {
          for (const n of availableChapterNumbers) {
            if (n <= end) result.add(n);
          }
        } else {
          const floorEnd = Math.floor(end);
          for (let i = Math.max(0, minAvailable); i <= floorEnd && i <= 500; i++) {
            result.add(i);
          }
        }
      }
      continue;
    }

    const rangeMatch = token.match(/^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)$/);
    if (rangeMatch) {
      const rawA = Number(rangeMatch[1]);
      const rawB = Number(rangeMatch[2]);
      const low = Math.min(rawA, rawB);
      const high = Math.max(rawA, rawB);
      if (availableChapterNumbers && availableChapterNumbers.length > 0) {
        for (const n of availableChapterNumbers) {
          if (n >= low && n <= high) result.add(n);
        }
      }
      const intLow = Math.floor(low);
      const intHigh = Math.floor(high);
      for (let i = intLow; i <= intHigh && i - intLow <= 500; i++) {
        result.add(i);
      }
    } else {
      const singleNum = Number(token);
      if (!Number.isNaN(singleNum) && singleNum >= 0) {
        result.add(singleNum);
      }
    }
  }
  return result;
}

export function computeReaderPageGroups(
  totalPages: number,
  mode: ReadingMode,
  offsetFirstPage: boolean = true
): number[][] {
  if (totalPages <= 0) return [];
  if (mode === 'webtoon' || mode === 'horizontal-strip') {
    return [Array.from({ length: totalPages }, (_, i) => i + 1)];
  }
  if (mode === 'single' || mode === 'vertical-paged') {
    return Array.from({ length: totalPages }, (_, i) => [i + 1]);
  }
  // Double spread mode
  const groups: number[][] = [];
  let startPage = 1;
  if (offsetFirstPage) {
    groups.push([1]);
    startPage = 2;
  }
  for (let p = startPage; p <= totalPages; p += 2) {
    if (p + 1 <= totalPages) {
      groups.push([p, p + 1]);
    } else {
      groups.push([p]);
    }
  }
  return groups;
}

export function getSpreadDisplayPages(
  spread: number[],
  mode: ReadingMode,
  direction: ReadingDirection
): number[] {
  if (mode === 'double' && direction === 'rtl' && spread.length === 2) {
    return [spread[1], spread[0]];
  }
  return [...spread];
}

export interface QueueSummaryStats {
  totalTasks: number;
  activeCount: number;
  queuedCount: number;
  completedCount: number;
  pausedCount: number;
  totalSpeedMbps: number;
  overallProgressPercent: number;
}

export function summarizeDownloadQueue(tasks: DownloadTask[]): QueueSummaryStats {
  if (tasks.length === 0) {
    return {
      totalTasks: 0,
      activeCount: 0,
      queuedCount: 0,
      completedCount: 0,
      pausedCount: 0,
      totalSpeedMbps: 0,
      overallProgressPercent: 0,
    };
  }

  let activeCount = 0;
  let queuedCount = 0;
  let completedCount = 0;
  let pausedCount = 0;
  let totalSpeedKbps = 0;
  let progressSum = 0;

  for (const t of tasks) {
    progressSum += t.progress;
    if (t.status === 'downloading') {
      activeCount++;
      totalSpeedKbps += t.speedKbps;
    } else if (t.status === 'queued') {
      queuedCount++;
    } else if (t.status === 'completed') {
      completedCount++;
    } else if (t.status === 'paused') {
      pausedCount++;
    }
  }

  return {
    totalTasks: tasks.length,
    activeCount,
    queuedCount,
    completedCount,
    pausedCount,
    totalSpeedMbps: Number((totalSpeedKbps / 1024).toFixed(2)),
    overallProgressPercent: Math.round(progressSum / tasks.length),
  };
}

export function buildComicInfoXml(task: {
  mangaTitle: string;
  chapterNumber: number;
  chapterTitle: string;
  sourceId: string;
  luaModule: string;
  totalPages: number;
}): string {
  const escapeXml = (str: string) =>
    str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<ComicInfo xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">',
    `  <Title>${escapeXml(task.chapterTitle)}</Title>`,
    `  <Series>${escapeXml(task.mangaTitle)}</Series>`,
    `  <Number>${task.chapterNumber}</Number>`,
    `  <PageCount>${task.totalPages}</PageCount>`,
    `  <LanguageISO>en</LanguageISO>`,
    `  <Notes>Downloaded by FMD2 Studio Engine via ${escapeXml(task.luaModule)} (${escapeXml(task.sourceId)})</Notes>`,
    '</ComicInfo>',
  ].join('\n');
}

export function computeCrc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export interface ZipEntryInput {
  fileName: string;
  content: Uint8Array | string;
}

export function buildZipArchiveBuffer(entries: ZipEntryInput[]): Uint8Array {
  const encoder = new TextEncoder();
  const localFileChunks: Uint8Array[] = [];
  const centralDirChunks: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = encoder.encode(entry.fileName);
    const dataBuf =
      typeof entry.content === 'string'
        ? encoder.encode(entry.content)
        : entry.content;
    const crc = computeCrc32(dataBuf);
    const size = dataBuf.byteLength;

    const lfh = new Uint8Array(30);
    const lfhView = new DataView(lfh.buffer);
    lfhView.setUint32(0, 0x04034b50, true);
    lfhView.setUint16(4, 20, true);
    lfhView.setUint16(6, 0, true);
    lfhView.setUint16(8, 0, true);
    lfhView.setUint16(10, 0, true);
    lfhView.setUint16(12, 0, true);
    lfhView.setUint32(14, crc, true);
    lfhView.setUint32(18, size, true);
    lfhView.setUint32(22, size, true);
    lfhView.setUint16(26, nameBuf.byteLength, true);
    lfhView.setUint16(28, 0, true);

    localFileChunks.push(lfh, nameBuf, dataBuf);

    const cdfh = new Uint8Array(46);
    const cdfhView = new DataView(cdfh.buffer);
    cdfhView.setUint32(0, 0x02014b50, true);
    cdfhView.setUint16(4, 20, true);
    cdfhView.setUint16(6, 20, true);
    cdfhView.setUint16(8, 0, true);
    cdfhView.setUint16(10, 0, true);
    cdfhView.setUint16(12, 0, true);
    cdfhView.setUint16(14, 0, true);
    cdfhView.setUint32(16, crc, true);
    cdfhView.setUint32(20, size, true);
    cdfhView.setUint32(24, size, true);
    cdfhView.setUint16(28, nameBuf.byteLength, true);
    cdfhView.setUint16(30, 0, true);
    cdfhView.setUint16(32, 0, true);
    cdfhView.setUint16(34, 0, true);
    cdfhView.setUint16(36, 0, true);
    cdfhView.setUint32(38, 0, true);
    cdfhView.setUint32(42, offset, true);

    centralDirChunks.push(cdfh, nameBuf);
    offset += 30 + nameBuf.byteLength + size;
  }

  let centralDirLength = 0;
  for (const c of centralDirChunks) centralDirLength += c.byteLength;

  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true);
  eocdView.setUint16(4, 0, true);
  eocdView.setUint16(6, 0, true);
  eocdView.setUint16(8, entries.length, true);
  eocdView.setUint16(10, entries.length, true);
  eocdView.setUint32(12, centralDirLength, true);
  eocdView.setUint32(16, offset, true);
  eocdView.setUint16(20, 0, true);

  const totalLength = offset + centralDirLength + 22;
  const result = new Uint8Array(totalLength);
  let pos = 0;
  for (const chunk of localFileChunks) {
    result.set(chunk, pos);
    pos += chunk.byteLength;
  }
  for (const chunk of centralDirChunks) {
    result.set(chunk, pos);
    pos += chunk.byteLength;
  }
  result.set(eocd, pos);
  return result;
}

// ---------------------------------------------------------------------------
// Pro Reader Player Presets & Source Browser Filter/Sort Engine
// ---------------------------------------------------------------------------

export type ReaderImageFit = 'contain' | 'width' | 'height' | 'original';
export type ReaderCanvasTheme = 'oled' | 'obsidian' | 'sepia' | 'paper';
export type WebtoonStripWidth = '640px' | '800px' | '1024px' | '100%';

export interface ReaderImageFitMeta {
  id: ReaderImageFit;
  label: string;
  shortLabel: string;
  description: string;
}

export const READER_IMAGE_FIT_META: ReaderImageFitMeta[] = [
  {
    id: 'contain',
    label: 'Fit Both (Contain)',
    shortLabel: 'Contain',
    description: 'Fits entire page inside viewport without cropping',
  },
  {
    id: 'width',
    label: 'Fit Width',
    shortLabel: 'Fit Width',
    description: 'Expands page horizontally to match container width',
  },
  {
    id: 'height',
    label: 'Fit Height',
    shortLabel: 'Fit Height',
    description: 'Locks page height to viewport for crisp vertical framing',
  },
  {
    id: 'original',
    label: 'Original Size (1:1)',
    shortLabel: 'Original',
    description: 'Displays native scan resolution without scaling constraint',
  },
];

export interface ReaderCanvasThemeMeta {
  id: ReaderCanvasTheme;
  label: string;
  bgHex: string;
  surfaceClass: string;
  textClass: string;
}

export const READER_CANVAS_THEMES_META: ReaderCanvasThemeMeta[] = [
  {
    id: 'oled',
    label: 'OLED Black',
    bgHex: '#000000',
    surfaceClass: 'bg-black text-slate-100',
    textClass: 'text-slate-100',
  },
  {
    id: 'obsidian',
    label: 'Obsidian Slate',
    bgHex: '#070A12',
    surfaceClass: 'bg-[#070A12] text-slate-100',
    textClass: 'text-slate-100',
  },
  {
    id: 'sepia',
    label: 'Warm Sepia',
    bgHex: '#1C1917',
    surfaceClass: 'bg-[#1C1917] text-amber-100',
    textClass: 'text-amber-100',
  },
  {
    id: 'paper',
    label: 'Paper Daylight',
    bgHex: '#F1F5F9',
    surfaceClass: 'bg-[#F1F5F9] text-slate-900',
    textClass: 'text-slate-900',
  },
];

export const AUTO_SCROLL_SPEED_PRESETS = [0.5, 1.0, 1.5, 2.0, 3.0] as const;

export function computeReaderOpticalFilterCss(
  brightness: number = 100,
  contrast: number = 100,
  warmth: number = 0
): string {
  const b = Math.max(50, Math.min(130, Math.round(brightness)));
  const c = Math.max(80, Math.min(130, Math.round(contrast)));
  const w = Math.max(0, Math.min(50, Math.round(warmth)));
  if (b === 100 && c === 100 && w === 0) {
    return 'none';
  }
  return `brightness(${b}%) contrast(${c}%) sepia(${w}%)`;
}

export type ContentFormat = 'Manga' | 'Manhwa' | 'Manhua' | 'Webtoon';
export type BrowseSortOption =
  | 'popular'
  | 'popularity'
  | 'latest'
  | 'newest'
  | 'rating'
  | 'title'
  | 'alphabetical'
  | 'chapters'
  | 'year_desc';
export type BrowseFormatFilter = 'All' | ContentFormat;
export type BrowseDemographicFilter = 'All' | 'Seinen' | 'Shounen' | 'Shoujo' | 'Josei' | 'Manhwa' | 'Webtoon';
export type BrowseStatusFilter = 'All' | 'Ongoing' | 'Completed' | 'Hiatus';
export type GenreMatchMode = 'AND' | 'OR';

export interface BrowseSortMenuOption {
  id: BrowseSortOption;
  label: string;
  shortLabel: string;
  description: string;
}

export const BROWSE_SORT_MENU_OPTIONS: BrowseSortMenuOption[] = [
  {
    id: 'popular',
    label: 'Popularity',
    shortLabel: 'Popularity',
    description: 'Most followed & trending series',
  },
  {
    id: 'latest',
    label: 'Newest',
    shortLabel: 'Newest',
    description: 'Newest releases & latest chapter updates',
  },
  {
    id: 'title',
    label: 'Alphabetical',
    shortLabel: 'Alphabetical (A–Z)',
    description: 'Order series titles A to Z',
  },
  {
    id: 'rating',
    label: 'Rating',
    shortLabel: 'Rating',
    description: 'Highest reader score first',
  },
  {
    id: 'chapters',
    label: 'Most Chapters',
    shortLabel: 'Most Chapters',
    description: 'Longest-running archives first',
  },
];

export interface SourceBrowseFilters {
  sourceId: SourceId | 'ALL';
  searchQuery: string;
  format: BrowseFormatFilter;
  demographic: BrowseDemographicFilter;
  status: BrowseStatusFilter;
  includedGenres: string[];
  excludedGenres: string[];
  genreMatchMode: GenreMatchMode;
  minChapters: number;
  minYear: number;
  maxYear: number;
  sortBy: BrowseSortOption;
}

export const DEFAULT_SOURCE_BROWSE_FILTERS: SourceBrowseFilters = {
  sourceId: 'ALL',
  searchQuery: '',
  format: 'All',
  demographic: 'All',
  status: 'All',
  includedGenres: [],
  excludedGenres: [],
  genreMatchMode: 'AND',
  minChapters: 0,
  minYear: 1985,
  maxYear: 2026,
  sortBy: 'popular',
};

/**
 * Classifies a series into its primary publishing format (Manga, Manhwa, Manhua, or Webtoon)
 * based on demographic and metadata/genre tags.
 */
export function getSeriesContentFormat(
  series: Pick<MangaSeries, 'demographic' | 'genres'> & { metadataTags?: string[] }
): ContentFormat {
  const tagsLower = getSeriesAllTags(series).map((t) => t.toLowerCase());
  const demoLower = (series.demographic || '').toLowerCase();

  if (
    demoLower.includes('manhua') ||
    tagsLower.includes('manhua') ||
    tagsLower.includes('cultivation')
  ) {
    return 'Manhua';
  }

  if (
    demoLower.includes('manhwa') ||
    tagsLower.includes('manhwa') ||
    tagsLower.includes('murim')
  ) {
    return 'Manhwa';
  }

  if (
    demoLower.includes('webtoon') ||
    tagsLower.includes('webtoon') ||
    tagsLower.includes('long strip') ||
    tagsLower.includes('vertical scroll')
  ) {
    return 'Webtoon';
  }

  return 'Manga';
}

/**
 * Cycles a genre tag through Tri-State filtering:
 * Neutral -> Included (+Genre) -> Excluded (-Genre) -> Neutral
 */
export function cycleTriStateGenreFilter(
  genre: string,
  includedGenres: string[],
  excludedGenres: string[]
): { includedGenres: string[]; excludedGenres: string[] } {
  const norm = genre.trim().toLowerCase();
  const isIncluded = includedGenres.some((g) => g.trim().toLowerCase() === norm);
  const isExcluded = excludedGenres.some((g) => g.trim().toLowerCase() === norm);

  if (!isIncluded && !isExcluded) {
    return {
      includedGenres: [...includedGenres, genre],
      excludedGenres,
    };
  }

  if (isIncluded) {
    return {
      includedGenres: includedGenres.filter((g) => g.trim().toLowerCase() !== norm),
      excludedGenres: [...excludedGenres, genre],
    };
  }

  return {
    includedGenres,
    excludedGenres: excludedGenres.filter((g) => g.trim().toLowerCase() !== norm),
  };
}

/**
 * Normalizes a sort option alias ('Newest', 'Alphabetical', 'Popularity', 'Rating', etc.)
 * into its canonical BrowseSortOption key.
 */
export function normalizeBrowseSortOption(raw: string): BrowseSortOption {
  const lower = (raw || '').trim().toLowerCase();
  if (lower === 'newest' || lower === 'latest') return 'latest';
  if (lower === 'alphabetical' || lower === 'title' || lower === 'a-z') return 'title';
  if (lower === 'rating' || lower === 'highest rating') return 'rating';
  if (lower === 'chapters' || lower === 'most chapters') return 'chapters';
  if (lower === 'year_desc' || lower === 'year') return 'year_desc';
  return 'popular';
}

export function applyBrowseHeaderSortBy(
  filters: SourceBrowseFilters,
  sortBy: string
): SourceBrowseFilters {
  return {
    ...filters,
    sortBy: normalizeBrowseSortOption(sortBy),
  };
}

/**
 * Filters and sorts the catalog for the Browse Sources workspace across source connectors,
 * formats, demographics, tri-state genre inclusion/exclusion, status, minimum chapter counts,
 * release year windows, and sort criteria.
 */
export function filterAndSortSourceBrowserCatalog(
  catalog: MangaSeries[],
  filters: Partial<SourceBrowseFilters> = {}
): MangaSeries[] {
  const f: SourceBrowseFilters = {
    ...DEFAULT_SOURCE_BROWSE_FILTERS,
    ...filters,
  };

  const includedLower = f.includedGenres.map((g) => g.trim().toLowerCase());
  const excludedLower = f.excludedGenres.map((g) => g.trim().toLowerCase());
  const hasSearch = f.searchQuery.trim().length > 0;

  const matched: { series: MangaSeries; searchScore: number }[] = [];

  for (const series of catalog) {
    // 1. Source connector filter
    if (f.sourceId !== 'ALL') {
      if (!seriesSupportsSource(series, f.sourceId)) {
        continue;
      }
    }

    const allTagsLower = getSeriesAllTags(series).map((t) => t.toLowerCase());
    const contentFormat = getSeriesContentFormat(series);

    // 2. Content format filter (Manga, Manhwa, Manhua, Webtoon)
    if (f.format !== 'All') {
      if (f.format === 'Webtoon') {
        const isWebtoonMode = resolveSeriesReadingMode(series).mode === 'webtoon';
        if (!isWebtoonMode && contentFormat !== 'Webtoon') continue;
      } else if (f.format === 'Manhua') {
        const isManhua =
          contentFormat === 'Manhua' ||
          allTagsLower.includes('manhua') ||
          allTagsLower.includes('murim') ||
          allTagsLower.includes('cultivation');
        if (!isManhua) continue;
      } else if (contentFormat !== f.format) {
        continue;
      }
    }

    // 3. Demographic filter
    if (f.demographic !== 'All') {
      const targetDemo = f.demographic.toLowerCase();
      const matchesDemo =
        series.demographic.toLowerCase().includes(targetDemo) ||
        allTagsLower.includes(targetDemo);
      if (!matchesDemo) continue;
    }

    // 4. Publication status filter
    if (f.status !== 'All' && series.status !== f.status) {
      continue;
    }

    // 5. Tri-state genre exclusion (-Genre)
    if (excludedLower.length > 0) {
      const hasForbidden = excludedLower.some((ex) => allTagsLower.includes(ex));
      if (hasForbidden) continue;
    }

    // 6. Tri-state genre inclusion (+Genre) with AND / OR match mode
    if (includedLower.length > 0) {
      if (f.genreMatchMode === 'AND') {
        const hasAll = includedLower.every((inc) => allTagsLower.includes(inc));
        if (!hasAll) continue;
      } else {
        const hasAny = includedLower.some((inc) => allTagsLower.includes(inc));
        if (!hasAny) continue;
      }
    }

    // 7. Minimum chapter count filter
    const effectiveChapters = Math.max(series.totalChapters || 0, series.chapters?.length || 0);
    if (f.minChapters > 0 && effectiveChapters < f.minChapters) {
      continue;
    }

    // 8. Release year range filter
    if (series.year < f.minYear || series.year > f.maxYear) {
      continue;
    }

    // 9. Search query filter
    let searchScore = 1;
    if (hasSearch) {
      searchScore = scoreMangaSearchMatch(series, f.searchQuery);
      if (searchScore <= 0) continue;
    }

    matched.push({ series, searchScore });
  }

  const effectiveSort = normalizeBrowseSortOption(f.sortBy);

  // 10. Sort results
  matched.sort((a, b) => {
    if (hasSearch && b.searchScore !== a.searchScore) {
      return b.searchScore - a.searchScore;
    }

    switch (effectiveSort) {
      case 'rating':
        if (b.series.rating !== a.series.rating) return b.series.rating - a.series.rating;
        return b.series.totalChapters - a.series.totalChapters;

      case 'latest':
      case 'newest': {
        const latestA = a.series.chapters[0]?.releaseDate || `${a.series.year}-01-01`;
        const latestB = b.series.chapters[0]?.releaseDate || `${b.series.year}-01-01`;
        if (latestB !== latestA) return latestB.localeCompare(latestA);
        return b.series.year - a.series.year;
      }

      case 'chapters':
        if (b.series.totalChapters !== a.series.totalChapters) {
          return b.series.totalChapters - a.series.totalChapters;
        }
        return b.series.rating - a.series.rating;

      case 'year_desc':
        if (b.series.year !== a.series.year) return b.series.year - a.series.year;
        return b.series.rating - a.series.rating;

      case 'title':
      case 'alphabetical':
        return a.series.title.localeCompare(b.series.title);

      case 'popular':
      case 'popularity':
      default: {
        const popA = a.series.rating * 100 + Math.min(a.series.totalChapters, 300);
        const popB = b.series.rating * 100 + Math.min(b.series.totalChapters, 300);
        return popB - popA;
      }
    }
  });

  return matched.map((m) => m.series);
}

export interface ReadingSessionProgress {
  seriesId: string;
  seriesTitle: string;
  chapterId: string;
  chapterNumber: number;
  chapterTitle: string;
  chapterExternalId?: string;
  sourceId: SourceId;
  lastPage: number;
  totalPages: number;
  readingMode?: ReadingMode;
  updatedAt: string;
  previousUpdatedAt?: string;
  sessionStartedAt?: string;
  sessionDurationMs?: number;
  deviceId?: string;
  deviceName?: string;
  syncedAt?: string;
}

export function normalizeSeriesMatchKey(title: string): string {
  return (title || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

const MAX_ACTIVE_SESSION_GAP_MS = 3 * 60 * 60 * 1000; // 3 hours

export function upsertReadingProgress(
  history: Record<string, ReadingSessionProgress>,
  entry: ReadingSessionProgress
): Record<string, ReadingSessionProgress> {
  const next: Record<string, ReadingSessionProgress> = { ...history };
  const normTarget = normalizeSeriesMatchKey(entry.seriesTitle);

  let existingSeriesEntry: ReadingSessionProgress | undefined = next[entry.seriesId];

  // Remove any older duplicate entry with a different seriesId that matches the same normalized series title
  for (const key of Object.keys(next)) {
    if (
      key !== entry.seriesId &&
      normTarget &&
      normalizeSeriesMatchKey(next[key].seriesTitle) === normTarget
    ) {
      if (!existingSeriesEntry) {
        existingSeriesEntry = next[key];
      }
      delete next[key];
    }
  }

  // Also locate the most recent sequential reading event across history prior to entry.updatedAt
  const currMs = Date.parse(entry.updatedAt);
  let latestPrecedingEvent: ReadingSessionProgress | undefined;
  let latestPrecedingMs = -Infinity;

  for (const item of Object.values(history)) {
    const itemMs = Date.parse(item.updatedAt);
    if (!Number.isNaN(itemMs) && !Number.isNaN(currMs) && itemMs <= currMs && itemMs > latestPrecedingMs) {
      if (item.seriesId !== entry.seriesId || item.updatedAt !== entry.updatedAt) {
        latestPrecedingMs = itemMs;
        latestPrecedingEvent = item;
      }
    }
  }

  let resolvedPreviousUpdatedAt = entry.previousUpdatedAt;
  let resolvedSessionStartedAt = entry.sessionStartedAt;
  let resolvedSessionDurationMs = entry.sessionDurationMs;

  if (existingSeriesEntry) {
    const prevMs = Date.parse(existingSeriesEntry.updatedAt);
    const deltaMs =
      !Number.isNaN(prevMs) && !Number.isNaN(currMs) ? Math.max(0, currMs - prevMs) : 0;

    if (deltaMs > 0 && deltaMs <= MAX_ACTIVE_SESSION_GAP_MS) {
      resolvedPreviousUpdatedAt = resolvedPreviousUpdatedAt || existingSeriesEntry.updatedAt;
      resolvedSessionStartedAt =
        resolvedSessionStartedAt ||
        existingSeriesEntry.sessionStartedAt ||
        existingSeriesEntry.previousUpdatedAt ||
        existingSeriesEntry.updatedAt;
      resolvedSessionDurationMs =
        typeof entry.sessionDurationMs === 'number'
          ? entry.sessionDurationMs
          : (existingSeriesEntry.sessionDurationMs || 0) + deltaMs;
    } else if (deltaMs === 0) {
      resolvedPreviousUpdatedAt =
        resolvedPreviousUpdatedAt || existingSeriesEntry.previousUpdatedAt;
      resolvedSessionStartedAt =
        resolvedSessionStartedAt ||
        existingSeriesEntry.sessionStartedAt ||
        existingSeriesEntry.updatedAt;
      resolvedSessionDurationMs =
        typeof entry.sessionDurationMs === 'number'
          ? entry.sessionDurationMs
          : existingSeriesEntry.sessionDurationMs || 0;
    } else {
      // Gap > MAX_ACTIVE_SESSION_GAP_MS: start a new session, or link to latestPrecedingEvent if within active window
      if (
        latestPrecedingEvent &&
        currMs - latestPrecedingMs > 0 &&
        currMs - latestPrecedingMs <= MAX_ACTIVE_SESSION_GAP_MS
      ) {
        resolvedPreviousUpdatedAt = resolvedPreviousUpdatedAt || latestPrecedingEvent.updatedAt;
        resolvedSessionStartedAt =
          resolvedSessionStartedAt || latestPrecedingEvent.updatedAt;
        resolvedSessionDurationMs =
          typeof entry.sessionDurationMs === 'number'
            ? entry.sessionDurationMs
            : currMs - latestPrecedingMs;
      } else {
        resolvedPreviousUpdatedAt = resolvedPreviousUpdatedAt || existingSeriesEntry.updatedAt;
        resolvedSessionStartedAt = resolvedSessionStartedAt || entry.updatedAt;
        resolvedSessionDurationMs =
          typeof entry.sessionDurationMs === 'number' ? entry.sessionDurationMs : 0;
      }
    }
  } else if (resolvedPreviousUpdatedAt) {
    const prevMs = Date.parse(resolvedPreviousUpdatedAt);
    const deltaMs =
      !Number.isNaN(prevMs) && !Number.isNaN(currMs) ? Math.max(0, currMs - prevMs) : 0;
    resolvedSessionStartedAt = resolvedSessionStartedAt || resolvedPreviousUpdatedAt;
    if (typeof resolvedSessionDurationMs !== 'number') {
      resolvedSessionDurationMs = deltaMs;
    }
  } else if (
    latestPrecedingEvent &&
    !Number.isNaN(currMs) &&
    currMs - latestPrecedingMs > 0 &&
    currMs - latestPrecedingMs <= MAX_ACTIVE_SESSION_GAP_MS
  ) {
    resolvedPreviousUpdatedAt = latestPrecedingEvent.updatedAt;
    resolvedSessionStartedAt = resolvedSessionStartedAt || latestPrecedingEvent.updatedAt;
    if (typeof resolvedSessionDurationMs !== 'number') {
      resolvedSessionDurationMs = currMs - latestPrecedingMs;
    }
  } else {
    resolvedSessionStartedAt = resolvedSessionStartedAt || entry.updatedAt;
    if (typeof resolvedSessionDurationMs !== 'number') {
      resolvedSessionDurationMs = 0;
    }
  }

  next[entry.seriesId] = {
    ...entry,
    lastPage: Math.max(1, Math.floor(entry.lastPage || 1)),
    totalPages: Math.max(1, Math.floor(entry.totalPages || 1)),
    previousUpdatedAt: resolvedPreviousUpdatedAt,
    sessionStartedAt: resolvedSessionStartedAt,
    sessionDurationMs: resolvedSessionDurationMs,
  };
  return next;
}

export function computeReadingSyncDurationMs(
  progress: ReadingSessionProgress | null | undefined,
  history?: Record<string, ReadingSessionProgress>
): number {
  if (!progress) return 0;

  if (typeof progress.sessionDurationMs === 'number' && progress.sessionDurationMs > 0) {
    return progress.sessionDurationMs;
  }

  const currMs = Date.parse(progress.updatedAt);
  if (Number.isNaN(currMs)) return 0;

  if (progress.previousUpdatedAt) {
    const prevMs = Date.parse(progress.previousUpdatedAt);
    if (!Number.isNaN(prevMs) && currMs > prevMs) {
      return currMs - prevMs;
    }
  }

  if (progress.sessionStartedAt) {
    const startMs = Date.parse(progress.sessionStartedAt);
    if (!Number.isNaN(startMs) && currMs > startMs) {
      return currMs - startMs;
    }
  }

  // Fallback: compute difference between updatedAt timestamps of sequential reading events in history
  if (history) {
    const sortedAsc = Object.values(history)
      .filter((e) => !Number.isNaN(Date.parse(e.updatedAt)))
      .sort((a, b) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt));

    const idx = sortedAsc.findIndex(
      (e) =>
        e.seriesId === progress.seriesId ||
        (e.updatedAt === progress.updatedAt && e.seriesTitle === progress.seriesTitle)
    );
    if (idx > 0) {
      const prevEventMs = Date.parse(sortedAsc[idx - 1].updatedAt);
      const diff = currMs - prevEventMs;
      if (diff > 0) {
        return diff;
      }
    } else if (idx === 0 && sortedAsc.length > 1) {
      const nextEventMs = Date.parse(sortedAsc[1].updatedAt);
      const diff = nextEventMs - currMs;
      if (diff > 0) {
        return diff;
      }
    }
  }

  return 0;
}

export function formatReadingSyncTime(durationMs: number): string {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return '< 1m';
  }
  const totalSec = Math.max(1, Math.round(durationMs / 1000));
  if (totalSec < 60) {
    return `${totalSec}s`;
  }
  const totalMin = Math.floor(totalSec / 60);
  const remSec = totalSec % 60;
  if (totalMin < 60) {
    if (remSec === 0 || totalMin >= 15) {
      return `${totalMin}m`;
    }
    return `${totalMin}m ${remSec}s`;
  }
  const hours = Math.floor(totalMin / 60);
  const remMin = totalMin % 60;
  return remMin > 0 ? `${hours}h ${remMin}m` : `${hours}h`;
}

export function getSeriesReadingProgress(
  history: Record<string, ReadingSessionProgress>,
  series: Pick<MangaSeries, 'id' | 'title'>
): ReadingSessionProgress | null {
  if (!history || !series) return null;
  if (history[series.id]) {
    return history[series.id];
  }
  const norm = normalizeSeriesMatchKey(series.title);
  if (!norm) return null;
  for (const entry of Object.values(history)) {
    if (normalizeSeriesMatchKey(entry.seriesTitle) === norm) {
      return entry;
    }
  }
  return null;
}

export function resolveResumeChapter(
  series: MangaSeries,
  progress: ReadingSessionProgress
): MangaChapter {
  const byId = series.chapters.find((c) => c.id === progress.chapterId);
  if (byId) return byId;

  const byNum = series.chapters.find((c) => c.number === progress.chapterNumber);
  if (byNum) {
    return progress.chapterExternalId && !byNum.externalId
      ? { ...byNum, externalId: progress.chapterExternalId }
      : byNum;
  }

  return {
    id: progress.chapterId || `${series.id}-ch-${progress.chapterNumber}`,
    number: progress.chapterNumber,
    title: progress.chapterTitle || `Chapter ${progress.chapterNumber}`,
    releaseDate: new Date(progress.updatedAt || Date.now()).toISOString().slice(0, 10),
    scanlationGroup: 'FMD2 Live Reader',
    pagesCount: progress.totalPages || 18,
    sourceId: progress.sourceId || series.primarySource,
    language: 'EN',
    externalId: progress.chapterExternalId,
  };
}

export function getSortedRecentlyReadEntries(
  history: Record<string, ReadingSessionProgress>,
  catalog: MangaSeries[]
): { series: MangaSeries; progress: ReadingSessionProgress }[] {
  if (!history || !Array.isArray(catalog)) return [];
  const entries = Object.values(history).sort((a, b) =>
    (b.updatedAt || '').localeCompare(a.updatedAt || '')
  );

  const result: { series: MangaSeries; progress: ReadingSessionProgress }[] = [];
  const seenSeriesIds = new Set<string>();

  for (const progress of entries) {
    const normTitle = normalizeSeriesMatchKey(progress.seriesTitle);
    const matchedSeries = catalog.find(
      (s) =>
        s.id === progress.seriesId ||
        (normTitle && normalizeSeriesMatchKey(s.title) === normTitle)
    );
    if (matchedSeries && !seenSeriesIds.has(matchedSeries.id)) {
      seenSeriesIds.add(matchedSeries.id);
      const syncMs = computeReadingSyncDurationMs(progress, history);
      result.push({
        series: matchedSeries,
        progress: syncMs > 0 && !progress.sessionDurationMs
          ? { ...progress, sessionDurationMs: syncMs }
          : progress,
      });
    }
  }

  return result;
}

export function formatRelativeReadTime(isoTimestamp: string, nowMs: number = Date.now()): string {
  const parsed = Date.parse(isoTimestamp);
  if (Number.isNaN(parsed)) return 'Recently';
  const diffSec = Math.max(0, Math.floor((nowMs - parsed) / 1000));
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 30) return `${diffDays}d ago`;
  return new Date(parsed).toISOString().slice(0, 10);
}

export function selectChaptersByRangeBounds(
  chapters: MangaChapter[],
  startChapter: number | null,
  endChapter: number | null
): string[] {
  if (!Array.isArray(chapters) || chapters.length === 0) return [];
  const hasStart = startChapter !== null && !Number.isNaN(startChapter);
  const hasEnd = endChapter !== null && !Number.isNaN(endChapter);
  if (!hasStart && !hasEnd) return [];

  const nums = chapters.map((c) => c.number);
  const minBound =
    hasStart && hasEnd
      ? Math.min(startChapter!, endChapter!)
      : hasStart
      ? startChapter!
      : Math.min(...nums);
  const maxBound =
    hasStart && hasEnd
      ? Math.max(startChapter!, endChapter!)
      : hasEnd
      ? endChapter!
      : Math.max(...nums);

  return chapters
    .filter((ch) => ch.number >= minBound && ch.number <= maxBound)
    .map((ch) => ch.id);
}

export interface NewChaptersResolution {
  chapters: MangaChapter[];
  chapterIds: string[];
  reason: string;
  unreadIds: string[];
  undownloadedIds: string[];
  queuedOrDownloadedNumbers: number[];
}

export function resolveNewChaptersForBatch(
  chapters: MangaChapter[],
  options: {
    readingProgress?: ReadingSessionProgress | null;
    existingTasks?: DownloadTask[];
    seriesId?: string;
    seriesTitle?: string;
  } = {}
): NewChaptersResolution {
  if (!Array.isArray(chapters) || chapters.length === 0) {
    return {
      chapters: [],
      chapterIds: [],
      reason: 'No chapters available',
      unreadIds: [],
      undownloadedIds: [],
      queuedOrDownloadedNumbers: [],
    };
  }

  const { readingProgress = null, existingTasks = [], seriesId = '', seriesTitle = '' } = options;
  const normSeriesTitle = normalizeSeriesMatchKey(seriesTitle);

  const queuedChapterNumbers = new Set<number>();
  const queuedChapterIds = new Set<string>();

  for (const task of existingTasks) {
    if (task.status === 'failed') continue;
    const matchesSeries =
      (seriesId && task.mangaId === seriesId) ||
      (normSeriesTitle && normalizeSeriesMatchKey(task.mangaTitle) === normSeriesTitle);
    if (matchesSeries) {
      queuedChapterNumbers.add(task.chapterNumber);
      if (task.chapterId) queuedChapterIds.add(task.chapterId);
    }
  }

  const isAlreadyQueuedOrDownloaded = (ch: MangaChapter): boolean =>
    queuedChapterIds.has(ch.id) || queuedChapterNumbers.has(ch.number);

  const undownloadedChapters = chapters.filter((ch) => !isAlreadyQueuedOrDownloaded(ch));
  const undownloadedIds = undownloadedChapters.map((ch) => ch.id);

  const unreadChapters = readingProgress
    ? chapters.filter((ch) => ch.number > readingProgress.chapterNumber)
    : chapters;
  const unreadIds = unreadChapters.map((ch) => ch.id);

  // Priority 1: If user has a reading session, "All New" = chapters after last-read chapter that aren't already queued/downloaded
  if (readingProgress) {
    const unreadAndUndownloaded = unreadChapters.filter((ch) => !isAlreadyQueuedOrDownloaded(ch));
    if (unreadAndUndownloaded.length > 0) {
      return {
        chapters: unreadAndUndownloaded,
        chapterIds: unreadAndUndownloaded.map((ch) => ch.id),
        reason: `New since Ch. ${readingProgress.chapterNumber} (unread & not queued)`,
        unreadIds,
        undownloadedIds,
        queuedOrDownloadedNumbers: Array.from(queuedChapterNumbers).sort((a, b) => a - b),
      };
    }
    if (unreadChapters.length > 0) {
      return {
        chapters: unreadChapters,
        chapterIds: unreadIds,
        reason: `New since last read (Ch. > ${readingProgress.chapterNumber})`,
        unreadIds,
        undownloadedIds,
        queuedOrDownloadedNumbers: Array.from(queuedChapterNumbers).sort((a, b) => a - b),
      };
    }
  }

  // Priority 2: Chapters not yet in the download queue for this series
  if (undownloadedChapters.length > 0 && undownloadedChapters.length < chapters.length) {
    return {
      chapters: undownloadedChapters,
      chapterIds: undownloadedIds,
      reason: `Unqueued chapters (${undownloadedChapters.length} not in download queue)`,
      unreadIds,
      undownloadedIds,
      queuedOrDownloadedNumbers: Array.from(queuedChapterNumbers).sort((a, b) => a - b),
    };
  }

  // Priority 3: All undownloaded chapters (or full chapter list if none queued yet)
  const fallbackTarget = undownloadedChapters.length > 0 ? undownloadedChapters : chapters;
  return {
    chapters: fallbackTarget,
    chapterIds: fallbackTarget.map((ch) => ch.id),
    reason:
      undownloadedChapters.length > 0
        ? `All ${undownloadedChapters.length} new unqueued chapters`
        : `All ${chapters.length} available chapters`,
    unreadIds,
    undownloadedIds,
    queuedOrDownloadedNumbers: Array.from(queuedChapterNumbers).sort((a, b) => a - b),
  };
}

/**
 * Returns every missing chapter in the series that is not currently present
 * (queued, downloading, packing, paused, or completed) in the download queue,
 * sorted in ascending chapter order for single-click batch queueing.
 */
export function resolveMissingChaptersForBatch(
  chapters: MangaChapter[],
  options: {
    existingTasks?: DownloadTask[];
    seriesId?: string;
    seriesTitle?: string;
  } = {}
): MangaChapter[] {
  if (!Array.isArray(chapters) || chapters.length === 0) {
    return [];
  }

  const { existingTasks = [], seriesId = '', seriesTitle = '' } = options;
  const normSeriesTitle = normalizeSeriesMatchKey(seriesTitle);

  const queuedChapterNumbers = new Set<number>();
  const queuedChapterIds = new Set<string>();

  for (const task of existingTasks) {
    if (task.status === 'failed') continue;
    const matchesSeries =
      (seriesId && task.mangaId === seriesId) ||
      (normSeriesTitle && normalizeSeriesMatchKey(task.mangaTitle) === normSeriesTitle);
    if (matchesSeries) {
      queuedChapterNumbers.add(task.chapterNumber);
      if (task.chapterId) queuedChapterIds.add(task.chapterId);
    }
  }

  return chapters
    .filter((ch) => !queuedChapterIds.has(ch.id) && !queuedChapterNumbers.has(ch.number))
    .sort((a, b) => a.number - b.number);
}

/**
 * Adds a batch of chapters for a series to an existing DownloadTask[] queue,
 * deduplicating any non-failed chapters already present in the queue.
 */
export function enqueueChaptersForDownload(
  existingTasks: DownloadTask[],
  series: Pick<MangaSeries, 'id' | 'title'>,
  chapters: MangaChapter[],
  sourceId: SourceId,
  format: ArchiveFormat
): DownloadTask[] {
  if (!Array.isArray(chapters) || chapters.length === 0) {
    return existingTasks;
  }

  const missing = resolveMissingChaptersForBatch(chapters, {
    existingTasks,
    seriesId: series.id,
    seriesTitle: series.title,
  });

  if (missing.length === 0) {
    return existingTasks;
  }

  const sourceMod = FMD2_SOURCE_MAP.get(sourceId) || FMD2_SOURCE_MODULES[0];
  const luaModule = sourceMod?.luaModule || 'lua/modules/WeebCentral.lua';
  const ext = format.toLowerCase();
  const safeSeriesName = series.title.replace(/[^a-zA-Z0-9_-]+/g, '_');

  const newTasks: DownloadTask[] = missing.map((ch, idx) => {
    const totalPages = ch.pagesCount || 18;
    const sizeMb = Number((totalPages * 0.42).toFixed(1));
    return {
      id: `dl-${series.id}-ch-${ch.number}-${Date.now()}-${idx}`,
      mangaId: series.id,
      mangaTitle: series.title,
      chapterId: ch.id,
      chapterNumber: ch.number,
      chapterTitle: ch.title || `Chapter ${ch.number}`,
      sourceId,
      luaModule,
      format,
      status: 'queued',
      progress: 0,
      pagesDownloaded: 0,
      totalPages,
      speedKbps: 0,
      sizeMb,
      addedAt: 'Just now',
      savePath: `/tmp/fmd2-downloads/${safeSeriesName}_Ch${String(ch.number).padStart(3, '0')}.${ext}`,
    };
  });

  // Replace any failed task for the same chapter or prepend newly queued tasks
  const addedChapterNums = new Set(missing.map((c) => c.number));
  const normSeriesTitle = normalizeSeriesMatchKey(series.title);
  const filteredExisting = existingTasks.filter((t) => {
    const matchesSeries =
      t.mangaId === series.id ||
      (normSeriesTitle && normalizeSeriesMatchKey(t.mangaTitle) === normSeriesTitle);
    if (matchesSeries && t.status === 'failed' && addedChapterNums.has(t.chapterNumber)) {
      return false;
    }
    return true;
  });

  return [...newTasks, ...filteredExisting];
}

export interface BatchSelectionStats {
  selectedCount: number;
  totalPages: number;
  estimatedSizeMb: number;
  chapterRangeLabel: string;
}

export function computeBatchSelectionStats(
  chapters: MangaChapter[],
  selectedIds: Set<string> | string[]
): BatchSelectionStats {
  const idSet = selectedIds instanceof Set ? selectedIds : new Set(selectedIds);
  const chosen = chapters
    .filter((ch) => idSet.has(ch.id))
    .sort((a, b) => a.number - b.number);

  if (chosen.length === 0) {
    return {
      selectedCount: 0,
      totalPages: 0,
      estimatedSizeMb: 0,
      chapterRangeLabel: 'None',
    };
  }

  const totalPages = chosen.reduce((acc, ch) => acc + (ch.pagesCount || 18), 0);
  const estimatedSizeMb = Number((totalPages * 0.42).toFixed(1));

  // Build compact range label e.g. "Ch. 1–4, 6"
  const nums = chosen.map((c) => c.number);
  const segments: string[] = [];
  let rangeStart = nums[0];
  let prev = nums[0];

  for (let i = 1; i < nums.length; i++) {
    const curr = nums[i];
    if (curr === prev + 1) {
      prev = curr;
    } else {
      segments.push(rangeStart === prev ? `${rangeStart}` : `${rangeStart}–${prev}`);
      rangeStart = curr;
      prev = curr;
    }
  }
  segments.push(rangeStart === prev ? `${rangeStart}` : `${rangeStart}–${prev}`);

  const joined = segments.slice(0, 4).join(', ') + (segments.length > 4 ? ', …' : '');

  return {
    selectedCount: chosen.length,
    totalPages,
    estimatedSizeMb,
    chapterRangeLabel: `Ch. ${joined}`,
  };
}

// ---------------------------------------------------------------------------
// Studio Theme & Appearance System (12 Curated Themes + Accent & Motion Options)
// ---------------------------------------------------------------------------

export type AppThemeId =
  | 'obsidian'
  | 'oled'
  | 'cyberpunk'
  | 'catppuccin'
  | 'dracula'
  | 'nord'
  | 'emerald'
  | 'crimson'
  | 'solarized'
  | 'matrix'
  | 'kyoto-light'
  | 'sakura-light';

export type AccentColorId =
  | 'theme-default'
  | 'indigo'
  | 'violet'
  | 'rose'
  | 'emerald'
  | 'cyan'
  | 'amber'
  | 'crimson'
  | 'sky';

export type UiAnimationStyle = 'smooth' | 'snappy' | 'minimal';
export type UiSurfaceStyle = 'glass' | 'matte' | 'bordered';
export type AppleFontPresetId = 'sf-pro' | 'new-york' | 'sf-compact';

export interface AppleFontPreset {
  id: AppleFontPresetId;
  label: string;
  shortLabel: string;
  description: string;
  displayStack: string;
  bodyStack: string;
  monoStack: string;
}

export const APPLE_FONT_PRESETS: AppleFontPreset[] = [
  {
    id: 'sf-pro',
    label: 'SF Pro Display & Text',
    shortLabel: 'SF Pro',
    description: 'Apple system neutral neo-grotesque for crisp, minimal interface hierarchy',
    displayStack: "'SF Pro Display', 'SF Pro', -apple-system, BlinkMacSystemFont, 'Plus Jakarta Sans', sans-serif",
    bodyStack: "'SF Pro Text', 'SF Pro', -apple-system, BlinkMacSystemFont, 'DM Sans', sans-serif",
    monoStack: "'SF Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, 'JetBrains Mono', monospace",
  },
  {
    id: 'new-york',
    label: 'New York Editorial + SF Pro',
    shortLabel: 'New York Serif',
    description: 'Apple Books literary serif headlines paired with SF Pro Text & SF Mono',
    displayStack: "'New York', ui-serif, 'Fraunces', Georgia, serif",
    bodyStack: "'SF Pro Text', 'SF Pro', -apple-system, BlinkMacSystemFont, 'DM Sans', sans-serif",
    monoStack: "'SF Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, 'JetBrains Mono', monospace",
  },
  {
    id: 'sf-compact',
    label: 'SF Compact Studio',
    shortLabel: 'SF Compact',
    description: 'Apple high-density compact UI proportions for large 600-source manga tables',
    displayStack: "'SF Compact Display', 'SF Compact', 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Outfit', sans-serif",
    bodyStack: "'SF Compact Text', 'SF Compact', 'SF Pro Text', -apple-system, BlinkMacSystemFont, 'DM Sans', sans-serif",
    monoStack: "'SF Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, 'JetBrains Mono', monospace",
  },
];

export interface AppThemePreset {
  id: AppThemeId;
  name: string;
  tagline: string;
  inspiredBy: string;
  mode: 'dark' | 'light';
  bgCanvas: string;
  bgSurface: string;
  bgElevated: string;
  borderHex: string;
  textPrimary: string;
  textSecondary: string;
  accentHex: string;
  accentSecondaryHex: string;
}

export const APP_THEME_PRESETS: AppThemePreset[] = [
  {
    id: 'obsidian',
    name: 'Obsidian Studio',
    tagline: 'Minimal carbon slate with electric indigo precision',
    inspiredBy: 'WeebCentral.lua · ComicK.lua',
    mode: 'dark',
    bgCanvas: '#090C12',
    bgSurface: '#0E131D',
    bgElevated: '#151C2A',
    borderHex: '#1E2738',
    textPrimary: '#F8FAFC',
    textSecondary: '#94A3B8',
    accentHex: '#6366F1',
    accentSecondaryHex: '#818CF8',
  },
  {
    id: 'oled',
    name: 'Asura OLED Pitch',
    tagline: 'True zero-luminance AMOLED pitch black with royal violet contrast',
    inspiredBy: 'AsuraScans.lua · ReaperScans.lua',
    mode: 'dark',
    bgCanvas: '#000000',
    bgSurface: '#08090E',
    bgElevated: '#11131C',
    borderHex: '#1D2030',
    textPrimary: '#FAFAFA',
    textSecondary: '#A1A1AA',
    accentHex: '#8B5CF6',
    accentSecondaryHex: '#A78BFA',
  },
  {
    id: 'cyberpunk',
    name: 'Tokyo Cyber-Ink',
    tagline: 'High-contrast night slate with crimson-rose & cyan accents',
    inspiredBy: 'FlameScans.lua · ResetScans.lua',
    mode: 'dark',
    bgCanvas: '#070912',
    bgSurface: '#0D1120',
    bgElevated: '#151C33',
    borderHex: '#232F52',
    textPrimary: '#F8FAFC',
    textSecondary: '#94A3B8',
    accentHex: '#F43F5E',
    accentSecondaryHex: '#06B6D4',
  },
  {
    id: 'catppuccin',
    name: 'Catppuccin Mocha',
    tagline: 'Warm velvet charcoal with pastel lavender & rosewater',
    inspiredBy: 'BatoTo.lua · MangaPark.lua',
    mode: 'dark',
    bgCanvas: '#11111B',
    bgSurface: '#181825',
    bgElevated: '#1E1E2E',
    borderHex: '#313244',
    textPrimary: '#CDD6F4',
    textSecondary: '#A6ADC8',
    accentHex: '#CBA6F7',
    accentSecondaryHex: '#F5C2E7',
  },
  {
    id: 'dracula',
    name: 'Dracula Pro',
    tagline: 'Iconic dark purple-slate studio with orchid & neon pink',
    inspiredBy: 'LeviatanScans.lua · LuminousScans.lua',
    mode: 'dark',
    bgCanvas: '#13141C',
    bgSurface: '#1C1D29',
    bgElevated: '#262837',
    borderHex: '#36394E',
    textPrimary: '#F8F8F2',
    textSecondary: '#9EA4C6',
    accentHex: '#BD93F9',
    accentSecondaryHex: '#FF79C6',
  },
  {
    id: 'nord',
    name: 'MangaSee Frost',
    tagline: 'Arctic polar night slate with glacier ice-blue highlights',
    inspiredBy: 'MangaSee.lua · MangaLife.lua',
    mode: 'dark',
    bgCanvas: '#181C24',
    bgSurface: '#212631',
    bgElevated: '#2B3240',
    borderHex: '#374052',
    textPrimary: '#ECEFF4',
    textSecondary: '#9AA5B8',
    accentHex: '#38BDF8',
    accentSecondaryHex: '#81A1C1',
  },
  {
    id: 'emerald',
    name: 'Katana Jade',
    tagline: 'Deep botanical forest slate with luminous jade emerald',
    inspiredBy: 'MangaKatana.lua · Webtoons.lua',
    mode: 'dark',
    bgCanvas: '#060E0B',
    bgSurface: '#0B1813',
    bgElevated: '#12261E',
    borderHex: '#1B382C',
    textPrimary: '#ECFDF5',
    textSecondary: '#86A899',
    accentHex: '#10B981',
    accentSecondaryHex: '#34D399',
  },
  {
    id: 'crimson',
    name: 'Crimson Eclipse',
    tagline: 'Dark eclipse obsidian with scarlet crimson accents',
    inspiredBy: 'LikeManga.lua · Manganato.lua',
    mode: 'dark',
    bgCanvas: '#0E0608',
    bgSurface: '#170B0E',
    bgElevated: '#241116',
    borderHex: '#381A22',
    textPrimary: '#FFF1F2',
    textSecondary: '#B8949A',
    accentHex: '#E11D48',
    accentSecondaryHex: '#FB7185',
  },
  {
    id: 'solarized',
    name: 'MangaDex Amber Dark',
    tagline: 'Warm charcoal slate with signature MangaDex burnt orange & amber',
    inspiredBy: 'MangaDex.lua · Mangakakalot.lua',
    mode: 'dark',
    bgCanvas: '#110E0B',
    bgSurface: '#191511',
    bgElevated: '#241E18',
    borderHex: '#362D23',
    textPrimary: '#FEF3C7',
    textSecondary: '#B5A38B',
    accentHex: '#F59E0B',
    accentSecondaryHex: '#F97316',
  },
  {
    id: 'matrix',
    name: 'Lua Terminal',
    tagline: 'High-contrast FMD2 console with phosphor green telemetry',
    inspiredBy: 'FMD2 Core Lua Engine · NineManga.lua',
    mode: 'dark',
    bgCanvas: '#040906',
    bgSurface: '#08120B',
    bgElevated: '#0E1F14',
    borderHex: '#183522',
    textPrimary: '#DCFCE7',
    textSecondary: '#74A684',
    accentHex: '#22C55E',
    accentSecondaryHex: '#4ADE80',
  },
  {
    id: 'kyoto-light',
    name: 'Apple Books Paper (Light)',
    tagline: 'Crisp Apple daylight paper with deep sumi-ink SF Pro typography',
    inspiredBy: 'Apple Books · MangaPlus Official',
    mode: 'light',
    bgCanvas: '#F2F4F8',
    bgSurface: '#FFFFFF',
    bgElevated: '#F8FAFC',
    borderHex: '#CBD5E1',
    textPrimary: '#0F172A',
    textSecondary: '#475569',
    accentHex: '#4F46E5',
    accentSecondaryHex: '#6366F1',
  },
  {
    id: 'sakura-light',
    name: 'Sakura Daylight (Light)',
    tagline: 'Soft alabaster blossom canvas with rosewood editorial contrast',
    inspiredBy: 'BookWalker · Hakusensha Daylight',
    mode: 'light',
    bgCanvas: '#FAF3F6',
    bgSurface: '#FFFFFF',
    bgElevated: '#FDF8FA',
    borderHex: '#E5CED8',
    textPrimary: '#1F1219',
    textSecondary: '#644957',
    accentHex: '#DB2777',
    accentSecondaryHex: '#EC4899',
  },
];

export interface AccentColorPreset {
  id: AccentColorId;
  label: string;
  hex: string;
  hoverHex: string;
  softHex: string;
}

export const ACCENT_COLOR_PRESETS: AccentColorPreset[] = [
  { id: 'theme-default', label: 'Theme Native', hex: '#6366F1', hoverHex: '#818CF8', softHex: '#A5B4FC' },
  { id: 'indigo', label: 'Electric Indigo', hex: '#6366F1', hoverHex: '#818CF8', softHex: '#A5B4FC' },
  { id: 'violet', label: 'Royal Violet', hex: '#8B5CF6', hoverHex: '#A78BFA', softHex: '#C4B5FD' },
  { id: 'rose', label: 'Cyber Rose', hex: '#F43F5E', hoverHex: '#FB7185', softHex: '#FDA4AF' },
  { id: 'emerald', label: 'Jade Emerald', hex: '#10B981', hoverHex: '#34D399', softHex: '#6EE7B7' },
  { id: 'cyan', label: 'Glacier Cyan', hex: '#06B6D4', hoverHex: '#22D3EE', softHex: '#67E8F9' },
  { id: 'amber', label: 'MangaDex Amber', hex: '#F59E0B', hoverHex: '#FBBF24', softHex: '#FCD34D' },
  { id: 'crimson', label: 'Blood Crimson', hex: '#E11D48', hoverHex: '#F43F5E', softHex: '#FDA4AF' },
  { id: 'sky', label: 'Aero Sky', hex: '#0EA5E9', hoverHex: '#38BDF8', softHex: '#7DD3FC' },
];

export const UI_ANIMATION_PRESETS: {
  id: UiAnimationStyle;
  label: string;
  description: string;
}[] = [
  {
    id: 'smooth',
    label: 'Smooth Spring',
    description: 'Apple spring button press physics, fluid view transitions & staggered reveals',
  },
  {
    id: 'snappy',
    label: 'Snappy Tactile',
    description: 'Ultra-fast 120ms tactile button response for high-speed manga workflows',
  },
  {
    id: 'minimal',
    label: 'Reduced Motion',
    description: 'Instant state switches without motion or transform animations',
  },
];

export const SURFACE_STYLE_PRESETS: {
  id: UiSurfaceStyle;
  label: string;
  description: string;
}[] = [
  {
    id: 'glass',
    label: 'Translucent Acrylic',
    description: 'Frosted Apple-style panels with subtle specular top edge',
  },
  {
    id: 'matte',
    label: 'Minimal Matte',
    description: 'Clean, distraction-free solid studio surfaces with zero translucency',
  },
  {
    id: 'bordered',
    label: 'Crisp Hairline Grid',
    description: 'High-contrast architectural hairline borders for dense tables',
  },
];

export interface UiThemePreferences {
  themeId: AppThemeId;
  accentId: AccentColorId;
  animationStyle: UiAnimationStyle;
  surfaceStyle: UiSurfaceStyle;
  cardHoverEffects: boolean;
  ambientGlow: boolean;
  cursorAnimation?: boolean;
  fontFamily?: AppleFontPresetId;
}

export const DEFAULT_UI_THEME_PREFS: UiThemePreferences = {
  themeId: 'obsidian',
  accentId: 'theme-default',
  animationStyle: 'smooth',
  surfaceStyle: 'glass',
  cardHoverEffects: true,
  ambientGlow: true,
  cursorAnimation: true,
  fontFamily: 'sf-pro',
};

export function updateUiThemePreferences(
  current: UiThemePreferences,
  partial: Partial<UiThemePreferences>
): UiThemePreferences {
  return {
    ...current,
    ...partial,
  };
}

export function toggleAmbientGlowPreference(
  current: UiThemePreferences
): UiThemePreferences {
  return {
    ...current,
    ambientGlow: !current.ambientGlow,
  };
}

// ---------------------------------------------------------------------------
// Power-User Primary Navigation Keyboard Shortcut System
// ---------------------------------------------------------------------------

export type PrimaryNavTab =
  | 'catalog'
  | 'browse'
  | 'read-later'
  | 'downloads'
  | 'reader'
  | 'archivist'
  | 'settings';

export interface PrimaryNavShortcutMeta {
  tab: PrimaryNavTab;
  key: string;
  numericKey: string;
  label: string;
  description: string;
}

export const PRIMARY_NAV_SHORTCUTS: PrimaryNavShortcutMeta[] = [
  {
    tab: 'catalog',
    key: 'c',
    numericKey: '1',
    label: 'Multi-Source Search',
    description: 'Jump to Multi-Source Catalog & Search',
  },
  {
    tab: 'browse',
    key: 'b',
    numericKey: '2',
    label: 'Browse Sources',
    description: 'Explore individual FMD2 source directories',
  },
  {
    tab: 'downloads',
    key: 'd',
    numericKey: '3',
    label: 'Downloads',
    description: 'Open FMD2 Download Queue & Batch Manager',
  },
  {
    tab: 'reader',
    key: 'r',
    numericKey: '4',
    label: 'Manga Reader',
    description: 'Resume active chapter in Manga & Webtoon Reader',
  },
  {
    tab: 'archivist',
    key: 'a',
    numericKey: '5',
    label: 'Archivist AI',
    description: 'Open Smart Discovery & Archivist recommendations',
  },
  {
    tab: 'settings',
    key: 's',
    numericKey: '6',
    label: 'Settings',
    description: 'Configure FMD2 Lua connectors, reader & themes',
  },
  {
    tab: 'read-later',
    key: 'l',
    numericKey: '7',
    label: 'Read Later',
    description: 'Open Read Later chapter reading queue',
  },
];

export interface ShortcutResolutionOptions {
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  isEditableTarget?: boolean;
}

export function resolvePrimaryNavShortcutTab(
  rawKey: string,
  options?: ShortcutResolutionOptions
): PrimaryNavTab | null {
  if (!rawKey || typeof rawKey !== 'string') return null;
  if (options?.ctrlKey || options?.metaKey || options?.altKey) return null;
  if (options?.isEditableTarget) return null;

  const normalized = rawKey.trim().toLowerCase();
  if (!normalized) return null;

  const matched = PRIMARY_NAV_SHORTCUTS.find(
    (item) => item.key === normalized || item.numericKey === normalized
  );
  return matched ? matched.tab : null;
}

// ---------------------------------------------------------------------------
// Catalog Grid Bulk Series Selection & Multi-Series Queueing Helpers
// ---------------------------------------------------------------------------

export function toggleCatalogSeriesSelection(
  selectedSeriesIds: string[],
  seriesId: string
): string[] {
  if (!seriesId) return selectedSeriesIds;
  if (selectedSeriesIds.includes(seriesId)) {
    return selectedSeriesIds.filter((id) => id !== seriesId);
  }
  return [...selectedSeriesIds, seriesId];
}

export function areAllCatalogSeriesSelected(
  selectedSeriesIds: string[],
  visibleSeries: Pick<MangaSeries, 'id'>[]
): boolean {
  if (!Array.isArray(visibleSeries) || visibleSeries.length === 0) {
    return false;
  }
  const selectedSet = new Set(selectedSeriesIds);
  return visibleSeries.every((series) => selectedSet.has(series.id));
}

export function toggleSelectAllCatalogSeries(
  selectedSeriesIds: string[],
  visibleSeries: Pick<MangaSeries, 'id'>[]
): string[] {
  if (!Array.isArray(visibleSeries) || visibleSeries.length === 0) {
    return [];
  }
  const visibleIds = visibleSeries.map((s) => s.id);
  const visibleIdSet = new Set(visibleIds);
  const allVisibleSelected = areAllCatalogSeriesSelected(selectedSeriesIds, visibleSeries);

  if (allVisibleSelected) {
    return selectedSeriesIds.filter((id) => !visibleIdSet.has(id));
  }

  const combined = new Set([...selectedSeriesIds, ...visibleIds]);
  return Array.from(combined);
}

export function getEffectiveSeriesChaptersForBulk(series: MangaSeries): MangaChapter[] {
  if (Array.isArray(series.chapters) && series.chapters.length > 0) {
    return series.chapters;
  }
  return [
    {
      id: `${series.id}-ch-1`,
      number: 1,
      title: 'Chapter 1',
      releaseDate: `${series.year || 2026}-01-01`,
      scanlationGroup: 'FMD2 Live Connector',
      pagesCount: 18,
      sourceId: series.primarySource,
      language: 'EN',
    },
  ];
}

export interface CatalogBulkSelectionStats {
  selectedSeriesCount: number;
  totalChaptersCount: number;
  missingChaptersCount: number;
  totalPagesCount: number;
  estimatedSizeMb: number;
}

export function computeCatalogBulkSelectionStats(
  catalog: MangaSeries[],
  selectedSeriesIds: string[],
  existingTasks: DownloadTask[] = []
): CatalogBulkSelectionStats {
  if (!Array.isArray(catalog) || !Array.isArray(selectedSeriesIds) || selectedSeriesIds.length === 0) {
    return {
      selectedSeriesCount: 0,
      totalChaptersCount: 0,
      missingChaptersCount: 0,
      totalPagesCount: 0,
      estimatedSizeMb: 0,
    };
  }

  const selectedSet = new Set(selectedSeriesIds);
  const selectedSeries = catalog.filter((s) => selectedSet.has(s.id));

  let totalChaptersCount = 0;
  let missingChaptersCount = 0;
  let totalPagesCount = 0;

  for (const series of selectedSeries) {
    const chapters = getEffectiveSeriesChaptersForBulk(series);
    totalChaptersCount += chapters.length;
    const missing = resolveMissingChaptersForBatch(chapters, {
      existingTasks,
      seriesId: series.id,
      seriesTitle: series.title,
    });
    const targetChapters = missing.length > 0 ? missing : chapters;
    missingChaptersCount += missing.length;
    for (const ch of targetChapters) {
      totalPagesCount += ch.pagesCount || 18;
    }
  }

  return {
    selectedSeriesCount: selectedSeries.length,
    totalChaptersCount,
    missingChaptersCount,
    totalPagesCount,
    estimatedSizeMb: Number((totalPagesCount * 0.42).toFixed(1)),
  };
}

export interface BulkSeriesQueueEntry {
  series: MangaSeries;
  chapters: MangaChapter[];
  sourceId: SourceId;
}

export interface BulkSeriesQueueResult {
  updatedQueue: DownloadTask[];
  addedChaptersCount: number;
  queuedSeriesCount: number;
  queuedEntries: BulkSeriesQueueEntry[];
}

export function enqueueMultipleSeriesForDownload(
  existingTasks: DownloadTask[],
  seriesList: MangaSeries[],
  format: ArchiveFormat = 'CBZ'
): BulkSeriesQueueResult {
  if (!Array.isArray(seriesList) || seriesList.length === 0) {
    return {
      updatedQueue: existingTasks,
      addedChaptersCount: 0,
      queuedSeriesCount: 0,
      queuedEntries: [],
    };
  }

  let currentQueue = [...existingTasks];
  let addedChaptersCount = 0;
  let queuedSeriesCount = 0;
  const queuedEntries: BulkSeriesQueueEntry[] = [];

  for (const series of seriesList) {
    const chapters = getEffectiveSeriesChaptersForBulk(series);
    const missing = resolveMissingChaptersForBatch(chapters, {
      existingTasks: currentQueue,
      seriesId: series.id,
      seriesTitle: series.title,
    });

    if (missing.length === 0) {
      continue;
    }

    const beforeLen = currentQueue.length;
    currentQueue = enqueueChaptersForDownload(
      currentQueue,
      series,
      missing,
      series.primarySource,
      format
    );
    const newlyAdded = Math.max(0, currentQueue.length - beforeLen);
    if (newlyAdded > 0 || missing.length > 0) {
      addedChaptersCount += missing.length;
      queuedSeriesCount += 1;
      queuedEntries.push({
        series,
        chapters: missing,
        sourceId: series.primarySource,
      });
    }
  }

  return {
    updatedQueue: currentQueue,
    addedChaptersCount,
    queuedSeriesCount,
    queuedEntries,
  };
}

// ---------------------------------------------------------------------------
// Visual Chapter Progression Map Helpers (Read / Downloaded / Missing)
// ---------------------------------------------------------------------------

export type ChapterLibraryState =
  | 'last-read'
  | 'read-downloaded'
  | 'read'
  | 'downloaded'
  | 'missing';

export type ChapterMapFilter = 'all' | 'read' | 'downloaded' | 'missing';

export interface ChapterProgressionItem {
  chapter: MangaChapter;
  chapterId: string;
  chapterNumber: number;
  title: string;
  pagesCount: number;
  isRead: boolean;
  isLastRead: boolean;
  isDownloaded: boolean;
  isCompletedDownload: boolean;
  isMissing: boolean;
  isSelected: boolean;
  visualState: ChapterLibraryState;
  statusLabel: string;
}

export interface ChapterProgressionMapSummary {
  items: ChapterProgressionItem[];
  totalChapters: number;
  readCount: number;
  downloadedCount: number;
  missingCount: number;
  readAndDownloadedCount: number;
  unreadMissingCount: number;
  readPct: number;
  downloadedPct: number;
  missingPct: number;
  libraryCoveragePct: number;
  missingChapters: MangaChapter[];
  missingChapterIds: string[];
}

export function computeChapterProgressionMap(
  chapters: MangaChapter[],
  options: {
    readingProgress?: ReadingSessionProgress | null;
    existingTasks?: DownloadTask[];
    seriesId?: string;
    seriesTitle?: string;
    selectedChapterIds?: Set<string> | string[];
  } = {}
): ChapterProgressionMapSummary {
  if (!Array.isArray(chapters) || chapters.length === 0) {
    return {
      items: [],
      totalChapters: 0,
      readCount: 0,
      downloadedCount: 0,
      missingCount: 0,
      readAndDownloadedCount: 0,
      unreadMissingCount: 0,
      readPct: 0,
      downloadedPct: 0,
      missingPct: 0,
      libraryCoveragePct: 0,
      missingChapters: [],
      missingChapterIds: [],
    };
  }

  const {
    readingProgress = null,
    existingTasks = [],
    seriesId = '',
    seriesTitle = '',
    selectedChapterIds,
  } = options;

  const selectedSet =
    selectedChapterIds instanceof Set
      ? selectedChapterIds
      : new Set(Array.isArray(selectedChapterIds) ? selectedChapterIds : []);

  const normSeriesTitle = normalizeSeriesMatchKey(seriesTitle);
  const downloadedChapterNumbers = new Set<number>();
  const downloadedChapterIds = new Set<string>();
  const completedChapterNumbers = new Set<number>();
  const completedChapterIds = new Set<string>();

  for (const task of existingTasks) {
    if (task.status === 'failed') continue;
    const matchesSeries =
      (seriesId && task.mangaId === seriesId) ||
      (normSeriesTitle && normalizeSeriesMatchKey(task.mangaTitle) === normSeriesTitle);
    if (matchesSeries) {
      downloadedChapterNumbers.add(task.chapterNumber);
      if (task.chapterId) downloadedChapterIds.add(task.chapterId);
      if (task.status === 'completed') {
        completedChapterNumbers.add(task.chapterNumber);
        if (task.chapterId) completedChapterIds.add(task.chapterId);
      }
    }
  }

  const sortedAsc = [...chapters].sort((a, b) => a.number - b.number);

  let readCount = 0;
  let downloadedCount = 0;
  let missingCount = 0;
  let readAndDownloadedCount = 0;
  let unreadMissingCount = 0;
  const missingChapters: MangaChapter[] = [];
  const missingChapterIds: string[] = [];

  const items: ChapterProgressionItem[] = sortedAsc.map((ch) => {
    const isLastRead =
      readingProgress !== null &&
      (readingProgress.chapterId === ch.id || readingProgress.chapterNumber === ch.number);
    const isRead =
      readingProgress !== null &&
      (isLastRead || ch.number <= readingProgress.chapterNumber);
    const isDownloaded =
      downloadedChapterIds.has(ch.id) || downloadedChapterNumbers.has(ch.number);
    const isCompletedDownload =
      completedChapterIds.has(ch.id) || completedChapterNumbers.has(ch.number);
    const isMissing = !isDownloaded;
    const isSelected = selectedSet.has(ch.id);

    if (isRead) readCount += 1;
    if (isDownloaded) downloadedCount += 1;
    if (isMissing) {
      missingCount += 1;
      missingChapters.push(ch);
      missingChapterIds.push(ch.id);
    }
    if (isRead && isDownloaded) readAndDownloadedCount += 1;
    if (!isRead && isMissing) unreadMissingCount += 1;

    let visualState: ChapterLibraryState = 'missing';
    let statusLabel = 'Missing in Library';

    if (isLastRead) {
      visualState = 'last-read';
      statusLabel = isDownloaded
        ? 'Last Read · Downloaded in Library'
        : 'Last Read Chapter';
    } else if (isRead && isDownloaded) {
      visualState = 'read-downloaded';
      statusLabel = isCompletedDownload
        ? 'Read & Saved in Library'
        : 'Read & Queued in Library';
    } else if (isRead) {
      visualState = 'read';
      statusLabel = 'Read (Not Downloaded)';
    } else if (isDownloaded) {
      visualState = 'downloaded';
      statusLabel = isCompletedDownload
        ? 'Downloaded in Library (Unread)'
        : 'Queued in Downloader (Unread)';
    }

    return {
      chapter: ch,
      chapterId: ch.id,
      chapterNumber: ch.number,
      title: ch.title,
      pagesCount: ch.pagesCount,
      isRead,
      isLastRead,
      isDownloaded,
      isCompletedDownload,
      isMissing,
      isSelected,
      visualState,
      statusLabel,
    };
  });

  const totalChapters = items.length;
  const coveredCount = items.filter((i) => i.isRead || i.isDownloaded).length;

  return {
    items,
    totalChapters,
    readCount,
    downloadedCount,
    missingCount,
    readAndDownloadedCount,
    unreadMissingCount,
    readPct: Math.round((readCount / totalChapters) * 100),
    downloadedPct: Math.round((downloadedCount / totalChapters) * 100),
    missingPct: Math.round((missingCount / totalChapters) * 100),
    libraryCoveragePct: Math.round((coveredCount / totalChapters) * 100),
    missingChapters,
    missingChapterIds,
  };
}

/**
 * Extracts all chapters marked as 'missing' directly from the computed ChapterProgressionMapSummary.
 */
export function getMissingChaptersFromProgressionMap(
  progressionMap: Pick<ChapterProgressionMapSummary, 'items' | 'missingChapters'>
): MangaChapter[] {
  if (!progressionMap) return [];
  if (Array.isArray(progressionMap.missingChapters) && progressionMap.missingChapters.length > 0) {
    return progressionMap.missingChapters;
  }
  if (!Array.isArray(progressionMap.items)) return [];
  return progressionMap.items
    .filter((item) => item.isMissing || item.visualState === 'missing')
    .map((item) => item.chapter);
}

/**
 * Queues all chapters marked as 'missing' in the chapter progression map into the download queue.
 */
export function queueMissingChaptersFromProgressionMap(options: {
  progressionMap: Pick<ChapterProgressionMapSummary, 'items' | 'missingChapters'>;
  existingTasks: DownloadTask[];
  series: Pick<MangaSeries, 'id' | 'title'>;
  sourceId: SourceId;
  format: ArchiveFormat;
}): {
  queuedChapters: MangaChapter[];
  queuedChapterIds: string[];
  updatedQueue: DownloadTask[];
} {
  const missingFromMap = getMissingChaptersFromProgressionMap(options.progressionMap);
  if (missingFromMap.length === 0) {
    return {
      queuedChapters: [],
      queuedChapterIds: [],
      updatedQueue: options.existingTasks,
    };
  }
  const updatedQueue = enqueueChaptersForDownload(
    options.existingTasks,
    options.series,
    missingFromMap,
    options.sourceId,
    options.format
  );
  return {
    queuedChapters: missingFromMap,
    queuedChapterIds: missingFromMap.map((c) => c.id),
    updatedQueue,
  };
}

// ---------------------------------------------------------------------------
// Chapter Ordering / Sort By Helpers ('Newest First', 'Oldest First', 'Unread First')
// ---------------------------------------------------------------------------

export type ChapterSortOrder = 'newest-first' | 'oldest-first' | 'unread-first';

export interface ChapterSortOptionMeta {
  id: ChapterSortOrder;
  label: 'Newest First' | 'Oldest First' | 'Unread First';
  shortLabel: string;
  description: string;
}

export const CHAPTER_SORT_OPTIONS: ChapterSortOptionMeta[] = [
  {
    id: 'newest-first',
    label: 'Newest First',
    shortLabel: 'Newest',
    description: 'Descending order from latest release to Chapter 1',
  },
  {
    id: 'oldest-first',
    label: 'Oldest First',
    shortLabel: 'Oldest',
    description: 'Ascending reading order from Chapter 1 to latest',
  },
  {
    id: 'unread-first',
    label: 'Unread First',
    shortLabel: 'Unread',
    description: 'Unread chapters prioritized first in reading order, followed by read chapters',
  },
];

export function isChapterMarkedRead(
  chapter: Pick<MangaChapter, 'id' | 'number'>,
  readingProgress?: ReadingSessionProgress | null
): boolean {
  if (!readingProgress) return false;
  return (
    readingProgress.chapterId === chapter.id ||
    chapter.number <= readingProgress.chapterNumber
  );
}

export function sortSeriesChapters(
  chapters: MangaChapter[],
  sortOrder: ChapterSortOrder,
  readingProgress?: ReadingSessionProgress | null
): MangaChapter[] {
  if (!Array.isArray(chapters) || chapters.length === 0) return [];
  const copy = [...chapters];

  if (sortOrder === 'oldest-first') {
    return copy.sort((a, b) => a.number - b.number);
  }

  if (sortOrder === 'unread-first') {
    return copy.sort((a, b) => {
      const readA = isChapterMarkedRead(a, readingProgress);
      const readB = isChapterMarkedRead(b, readingProgress);
      if (readA !== readB) {
        return readA ? 1 : -1;
      }
      return a.number - b.number;
    });
  }

  // Default: 'newest-first'
  return copy.sort((a, b) => b.number - a.number);
}

// ---------------------------------------------------------------------------
// Cloud Reading History Sync & Cross-Device Session Continuation Helpers
// ---------------------------------------------------------------------------

export const DEFAULT_CLOUD_SYNC_KEY = 'fmd2-global-cloud';

export type CloudSyncStatus = 'synced' | 'syncing' | 'pending' | 'offline' | 'error';

export interface CloudSyncConfig {
  syncKey: string;
  deviceId: string;
  deviceName: string;
  autoSync: boolean;
  lastSyncedAt: string | null;
  revision: number;
}

export interface CloudSyncSnapshot {
  syncKey: string;
  readingHistory: Record<string, ReadingSessionProgress>;
  bookmarkedIds: string[];
  updatedAt: string;
  revision: number;
  lastDeviceId?: string;
  lastDeviceName?: string;
}

export function normalizeCloudSyncKey(rawKey?: string | null): string {
  if (!rawKey || typeof rawKey !== 'string') {
    return DEFAULT_CLOUD_SYNC_KEY;
  }
  const cleaned = rawKey
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return cleaned.length >= 2 ? cleaned : DEFAULT_CLOUD_SYNC_KEY;
}

export function sanitizeReadingProgressEntry(
  raw: unknown
): ReadingSessionProgress | null {
  if (!raw || typeof raw !== 'object') return null;
  const item = raw as Partial<ReadingSessionProgress>;
  const seriesId = typeof item.seriesId === 'string' ? item.seriesId.trim() : '';
  const seriesTitle = typeof item.seriesTitle === 'string' ? item.seriesTitle.trim() : '';
  if (!seriesId || !seriesTitle) return null;

  const chapterNumber = Number(item.chapterNumber);
  if (!Number.isFinite(chapterNumber) || chapterNumber < 0) return null;

  const lastPage = Math.max(1, Math.floor(Number(item.lastPage) || 1));
  const totalPages = Math.max(lastPage, Math.max(1, Math.floor(Number(item.totalPages) || 18)));
  const updatedAt =
    typeof item.updatedAt === 'string' && !Number.isNaN(Date.parse(item.updatedAt))
      ? item.updatedAt
      : new Date().toISOString();

  return {
    seriesId,
    seriesTitle,
    chapterId:
      typeof item.chapterId === 'string' && item.chapterId.trim()
        ? item.chapterId.trim()
        : `${seriesId}-ch-${chapterNumber}`,
    chapterNumber,
    chapterTitle:
      typeof item.chapterTitle === 'string' && item.chapterTitle.trim()
        ? item.chapterTitle.trim()
        : `Chapter ${chapterNumber}`,
    chapterExternalId:
      typeof item.chapterExternalId === 'string' && item.chapterExternalId.trim()
        ? item.chapterExternalId.trim()
        : undefined,
    sourceId: (typeof item.sourceId === 'string' && item.sourceId.trim()
      ? item.sourceId.trim()
      : 'weebcentral') as SourceId,
    lastPage,
    totalPages,
    readingMode: item.readingMode,
    updatedAt,
    previousUpdatedAt:
      typeof item.previousUpdatedAt === 'string' ? item.previousUpdatedAt : undefined,
    sessionStartedAt:
      typeof item.sessionStartedAt === 'string' ? item.sessionStartedAt : undefined,
    sessionDurationMs:
      typeof item.sessionDurationMs === 'number' && Number.isFinite(item.sessionDurationMs)
        ? Math.max(0, item.sessionDurationMs)
        : undefined,
    deviceId: typeof item.deviceId === 'string' ? item.deviceId : undefined,
    deviceName: typeof item.deviceName === 'string' ? item.deviceName : undefined,
    syncedAt: typeof item.syncedAt === 'string' ? item.syncedAt : undefined,
  };
}

export function sanitizeReadingHistoryMap(
  raw: unknown
): Record<string, ReadingSessionProgress> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }
  const result: Record<string, ReadingSessionProgress> = {};
  for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
    const clean = sanitizeReadingProgressEntry(val);
    if (clean) {
      result[clean.seriesId || key] = clean;
    }
  }
  return result;
}

/**
 * Deterministically resolves two ReadingSessionProgress records for the same series
 * across devices using Last-Write-Wins (updatedAt timestamp), breaking ties by
 * higher chapter number and higher page number, while preserving session duration telemetry.
 */
export function pickNewerReadingProgress(
  a: ReadingSessionProgress,
  b: ReadingSessionProgress
): ReadingSessionProgress {
  const timeA = Date.parse(a.updatedAt);
  const timeB = Date.parse(b.updatedAt);
  const validA = !Number.isNaN(timeA);
  const validB = !Number.isNaN(timeB);

  let winner: ReadingSessionProgress;
  let older: ReadingSessionProgress;

  if (validA && validB) {
    if (timeB > timeA) {
      winner = b;
      older = a;
    } else if (timeA > timeB) {
      winner = a;
      older = b;
    } else {
      // Tie-breaker: furthest chapter or page progress
      if (b.chapterNumber !== a.chapterNumber) {
        winner = b.chapterNumber > a.chapterNumber ? b : a;
        older = winner === b ? a : b;
      } else {
        winner = b.lastPage >= a.lastPage ? b : a;
        older = winner === b ? a : b;
      }
    }
  } else if (validB) {
    winner = b;
    older = a;
  } else {
    winner = a;
    older = b;
  }

  return {
    ...older,
    ...winner,
    previousUpdatedAt: winner.previousUpdatedAt || older.updatedAt,
    sessionStartedAt:
      winner.sessionStartedAt || older.sessionStartedAt || older.updatedAt,
    sessionDurationMs:
      typeof winner.sessionDurationMs === 'number' && winner.sessionDurationMs > 0
        ? winner.sessionDurationMs
        : older.sessionDurationMs,
  };
}

/**
 * Merges local and remote reading histories across devices without losing progress.
 * Deduplicates entries that share either the same seriesId or normalized seriesTitle.
 */
export function mergeReadingHistories(
  localHistory: Record<string, ReadingSessionProgress>,
  remoteHistory: Record<string, ReadingSessionProgress>
): Record<string, ReadingSessionProgress> {
  const cleanLocal = sanitizeReadingHistoryMap(localHistory);
  const cleanRemote = sanitizeReadingHistoryMap(remoteHistory);

  const mergedBySeriesId: Record<string, ReadingSessionProgress> = {};
  const normTitleToSeriesId = new Map<string, string>();

  const insertOrMerge = (entry: ReadingSessionProgress) => {
    const normTitle = normalizeSeriesMatchKey(entry.seriesTitle);
    const existingKeyById = mergedBySeriesId[entry.seriesId] ? entry.seriesId : undefined;
    const existingKeyByTitle = normTitle ? normTitleToSeriesId.get(normTitle) : undefined;
    const targetKey = existingKeyById || existingKeyByTitle;

    if (!targetKey) {
      mergedBySeriesId[entry.seriesId] = entry;
      if (normTitle) {
        normTitleToSeriesId.set(normTitle, entry.seriesId);
      }
      return;
    }

    const existing = mergedBySeriesId[targetKey];
    const resolved = pickNewerReadingProgress(existing, entry);
    if (targetKey !== resolved.seriesId) {
      delete mergedBySeriesId[targetKey];
    }
    mergedBySeriesId[resolved.seriesId] = resolved;
    if (normTitle) {
      normTitleToSeriesId.set(normTitle, resolved.seriesId);
    }
  };

  for (const entry of Object.values(cleanRemote)) {
    insertOrMerge(entry);
  }
  for (const entry of Object.values(cleanLocal)) {
    insertOrMerge(entry);
  }

  return mergedBySeriesId;
}

export function mergeBookmarkedIds(
  localIds: string[] = [],
  remoteIds: string[] = []
): string[] {
  const set = new Set<string>();
  if (Array.isArray(remoteIds)) {
    for (const id of remoteIds) {
      if (typeof id === 'string' && id.trim()) set.add(id.trim());
    }
  }
  if (Array.isArray(localIds)) {
    for (const id of localIds) {
      if (typeof id === 'string' && id.trim()) set.add(id.trim());
    }
  }
  return Array.from(set);
}

export function hasUnsyncedReadingChanges(
  localHistory: Record<string, ReadingSessionProgress>,
  remoteHistory: Record<string, ReadingSessionProgress>
): boolean {
  const localKeys = Object.keys(localHistory || {});
  const remoteKeys = Object.keys(remoteHistory || {});
  if (localKeys.length !== remoteKeys.length) return true;

  for (const key of localKeys) {
    const l = localHistory[key];
    const r = remoteHistory[key];
    if (!r) return true;
    if (
      l.chapterNumber !== r.chapterNumber ||
      l.lastPage !== r.lastPage ||
      l.updatedAt !== r.updatedAt ||
      l.sourceId !== r.sourceId
    ) {
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Read Later Chapter Queue Helpers (Separate from Series Bookmark Library)
// ---------------------------------------------------------------------------

export const READ_LATER_STORAGE_KEY = 'fmd2_read_later_queue_v1';

export interface ReadLaterItem {
  id: string;
  seriesId: string;
  seriesTitle: string;
  chapterId: string;
  chapterNumber: number;
  chapterTitle: string;
  chapterExternalId?: string;
  pagesCount: number;
  scanlationGroup: string;
  releaseDate: string;
  sourceId: SourceId;
  addedAt: string;
}

export function buildReadLaterItemId(
  seriesId: string,
  chapterNumber: number,
  chapterId?: string
): string {
  const cleanSeries = String(seriesId || '').trim();
  const cleanNum = Number.isFinite(Number(chapterNumber)) ? Number(chapterNumber) : 1;
  if (cleanSeries) {
    return `${cleanSeries}::ch-${cleanNum}`;
  }
  return String(chapterId || `ch-${cleanNum}`);
}

export function isChapterInReadLaterQueue(
  queue: ReadLaterItem[],
  seriesId: string,
  chapter: Pick<MangaChapter, 'id' | 'number'>
): boolean {
  if (!Array.isArray(queue) || queue.length === 0) return false;
  const targetId = buildReadLaterItemId(seriesId, chapter.number, chapter.id);
  return queue.some(
    (item) =>
      item.id === targetId ||
      (item.seriesId === seriesId &&
        (item.chapterId === chapter.id || item.chapterNumber === chapter.number))
  );
}

export function createReadLaterItem(
  series: Pick<MangaSeries, 'id' | 'title' | 'primarySource'>,
  chapter: MangaChapter,
  sourceId?: SourceId,
  addedAtIso?: string
): ReadLaterItem {
  const effectiveSource = sourceId || chapter.sourceId || series.primarySource || 'weebcentral';
  return {
    id: buildReadLaterItemId(series.id, chapter.number, chapter.id),
    seriesId: series.id,
    seriesTitle: series.title,
    chapterId: chapter.id,
    chapterNumber: chapter.number,
    chapterTitle: chapter.title || `Chapter ${chapter.number}`,
    chapterExternalId: chapter.externalId,
    pagesCount: chapter.pagesCount || 18,
    scanlationGroup: chapter.scanlationGroup || 'FMD2 Live Connector',
    releaseDate: chapter.releaseDate || '2026-01-01',
    sourceId: effectiveSource,
    addedAt: addedAtIso || new Date().toISOString(),
  };
}

export function addChapterToReadLaterQueue(
  queue: ReadLaterItem[],
  series: Pick<MangaSeries, 'id' | 'title' | 'primarySource'>,
  chapter: MangaChapter,
  sourceId?: SourceId,
  addedAtIso?: string
): ReadLaterItem[] {
  const safeQueue = Array.isArray(queue) ? queue : [];
  if (isChapterInReadLaterQueue(safeQueue, series.id, chapter)) {
    return safeQueue;
  }
  const newItem = createReadLaterItem(series, chapter, sourceId, addedAtIso);
  return [newItem, ...safeQueue];
}

export function removeChapterFromReadLaterQueue(
  queue: ReadLaterItem[],
  target:
    | string
    | {
        seriesId: string;
        chapterId?: string;
        chapterNumber?: number;
      }
): ReadLaterItem[] {
  if (!Array.isArray(queue) || queue.length === 0) return [];
  if (typeof target === 'string') {
    return queue.filter((item) => item.id !== target && item.chapterId !== target);
  }
  return queue.filter((item) => {
    if (item.seriesId !== target.seriesId) return true;
    if (target.chapterId && item.chapterId === target.chapterId) return false;
    if (
      typeof target.chapterNumber === 'number' &&
      item.chapterNumber === target.chapterNumber
    ) {
      return false;
    }
    return true;
  });
}

export function toggleChapterInReadLaterQueue(
  queue: ReadLaterItem[],
  series: Pick<MangaSeries, 'id' | 'title' | 'primarySource'>,
  chapter: MangaChapter,
  sourceId?: SourceId,
  addedAtIso?: string
): {
  updatedQueue: ReadLaterItem[];
  added: boolean;
  item: ReadLaterItem;
} {
  const safeQueue = Array.isArray(queue) ? queue : [];
  const item = createReadLaterItem(series, chapter, sourceId, addedAtIso);
  const exists = isChapterInReadLaterQueue(safeQueue, series.id, chapter);
  if (exists) {
    return {
      updatedQueue: removeChapterFromReadLaterQueue(safeQueue, {
        seriesId: series.id,
        chapterId: chapter.id,
        chapterNumber: chapter.number,
      }),
      added: false,
      item,
    };
  }
  return {
    updatedQueue: [item, ...safeQueue],
    added: true,
    item,
  };
}

export function moveReadLaterQueueItem(
  queue: ReadLaterItem[],
  itemId: string,
  direction: 'up' | 'down' | 'top'
): ReadLaterItem[] {
  if (!Array.isArray(queue) || queue.length <= 1) return queue;
  const idx = queue.findIndex((item) => item.id === itemId);
  if (idx === -1) return queue;

  const next = [...queue];
  if (direction === 'top') {
    if (idx === 0) return queue;
    const [picked] = next.splice(idx, 1);
    next.unshift(picked);
    return next;
  }

  const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (targetIdx < 0 || targetIdx >= next.length) return queue;
  const temp = next[idx];
  next[idx] = next[targetIdx];
  next[targetIdx] = temp;
  return next;
}

export interface BrowseHeaderFilterOptions {
  genres: { name: string; count: number }[];
  statusCounts: Record<BrowseStatusFilter, number>;
}

/**
 * Computes available genres (with series counts) and manga release status counts
 * for the Browse Sources header dropdown menus.
 */
export function computeBrowseHeaderFilterOptions(
  catalog: MangaSeries[],
  sourceId: SourceId | 'ALL' = 'ALL',
  canonicalGenres: string[] = []
): BrowseHeaderFilterOptions {
  const safeCatalog = Array.isArray(catalog) ? catalog : [];
  const sourcePool =
    sourceId === 'ALL'
      ? safeCatalog
      : safeCatalog.filter((series) => seriesSupportsSource(series, sourceId));

  const statusCounts: Record<BrowseStatusFilter, number> = {
    All: sourcePool.length,
    Ongoing: 0,
    Completed: 0,
    Hiatus: 0,
  };

  const genreMap = new Map<string, { display: string; count: number }>();
  for (const g of canonicalGenres) {
    const trimmed = g.trim();
    if (trimmed) {
      genreMap.set(trimmed.toLowerCase(), { display: trimmed, count: 0 });
    }
  }

  for (const series of sourcePool) {
    if (series.status === 'Ongoing') statusCounts.Ongoing += 1;
    else if (series.status === 'Completed') statusCounts.Completed += 1;
    else if (series.status === 'Hiatus') statusCounts.Hiatus += 1;

    if (Array.isArray(series.genres)) {
      const seenInSeries = new Set<string>();
      for (const rawGenre of series.genres) {
        const trimmed = (rawGenre || '').trim();
        if (!trimmed) continue;
        const key = trimmed.toLowerCase();
        if (seenInSeries.has(key)) continue;
        seenInSeries.add(key);
        const existing = genreMap.get(key);
        if (existing) {
          existing.count += 1;
        } else {
          genreMap.set(key, { display: trimmed, count: 1 });
        }
      }
    }
  }

  const genres = Array.from(genreMap.values())
    .map((entry) => ({ name: entry.display, count: entry.count }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    genres,
    statusCounts,
  };
}

/**
 * Applies a single-select Genre choice from the Browse Sources header dropdown
 * while keeping the SourceBrowseFilters state consistent.
 */
export function applyBrowseHeaderGenreFilter(
  filters: SourceBrowseFilters,
  selectedGenre: string
): SourceBrowseFilters {
  const normalized = (selectedGenre || '').trim();
  if (!normalized || normalized === 'All') {
    return {
      ...filters,
      includedGenres: [],
    };
  }
  return {
    ...filters,
    includedGenres: [normalized],
    excludedGenres: filters.excludedGenres.filter(
      (g) => g.toLowerCase() !== normalized.toLowerCase()
    ),
  };
}

/**
 * Applies a Manga Status choice ('All' | 'Ongoing' | 'Completed' | 'Hiatus')
 * from the Browse Sources header dropdown.
 */
export function applyBrowseHeaderStatusFilter(
  filters: SourceBrowseFilters,
  selectedStatus: BrowseStatusFilter
): SourceBrowseFilters {
  const validStatuses: BrowseStatusFilter[] = ['All', 'Ongoing', 'Completed', 'Hiatus'];
  const nextStatus: BrowseStatusFilter = validStatuses.includes(selectedStatus)
    ? selectedStatus
    : 'All';
  return {
    ...filters,
    status: nextStatus,
  };
}
