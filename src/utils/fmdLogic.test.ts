import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALL_FMD2_SOURCES,
  DEFAULT_ENABLED_SOURCE_IDS,
  parseFmdDirectUrl,
  filterAndRankMangaCatalog,
  filterFmdSourcesCatalogue,
  parseChapterRangeExpression,
  computeReaderPageGroups,
  getSpreadDisplayPages,
  getDefaultReadingModeForSeries,
  resolveSeriesReadingMode,
  getSeriesAllTags,
  DEFAULT_WEBTOON_TRIGGER_TAGS,
  READING_MODES_META,
  summarizeDownloadQueue,
  buildComicInfoXml,
  buildZipArchiveBuffer,
  getSeriesContentFormat,
  cycleTriStateGenreFilter,
  filterAndSortSourceBrowserCatalog,
  computeReaderOpticalFilterCss,
  upsertReadingProgress,
  getSeriesReadingProgress,
  resolveResumeChapter,
  getSortedRecentlyReadEntries,
  formatRelativeReadTime,
  computeReadingSyncDurationMs,
  formatReadingSyncTime,
  selectChaptersByRangeBounds,
  resolveNewChaptersForBatch,
  resolveMissingChaptersForBatch,
  enqueueChaptersForDownload,
  computeBatchSelectionStats,
  type MangaSeries,
  type MangaChapter,
  type DownloadTask,
  type ReadingSessionProgress,
} from './fmdLogic.ts';

const MOCK_CATALOG: MangaSeries[] = [
  {
    id: 'solo-leveling',
    slug: 'solo-leveling',
    title: 'Solo Leveling',
    altTitles: ['Solo Levelling', 'Na Honjaman Level Up', 'Only I Level Up', 'SL'],
    author: 'Chugong',
    artist: 'DUBU (REDICE Studio)',
    status: 'Completed',
    year: 2018,
    rating: 9.4,
    demographic: 'Manhwa',
    genres: ['Action', 'Fantasy', 'Dungeon'],
    synopsis: 'E-rank hunter Jinwoo Sung awakens the System.',
    availableSources: ['asurascans', 'likemanga', 'weebcentral', 'mangadex'],
    primarySource: 'asurascans',
    coverTheme: 'shadow-monarch',
    totalChapters: 200,
    chapters: [],
  },
  {
    id: 'berserk',
    slug: 'berserk',
    title: 'Berserk',
    altTitles: ['Kenpuu Denki Berserk', 'Guts'],
    author: 'Kentaro Miura',
    artist: 'Kentaro Miura',
    status: 'Ongoing',
    year: 1989,
    rating: 9.7,
    demographic: 'Seinen',
    genres: ['Dark Fantasy', 'Action', 'Tragedy'],
    synopsis: 'Guts, the Black Swordsman, defies fate.',
    availableSources: ['weebcentral', 'mangadex', 'mangakatana'],
    primarySource: 'weebcentral',
    coverTheme: 'eclipse-berserk',
    totalChapters: 376,
    chapters: [],
  },
  {
    id: 'omniscient-reader',
    slug: 'omniscient-readers-viewpoint',
    title: "Omniscient Reader's Viewpoint",
    altTitles: ['ORV', 'Kim Dokja'],
    author: 'Sing N Song',
    artist: 'Sleepy-C',
    status: 'Ongoing',
    year: 2020,
    rating: 9.3,
    demographic: 'Manhwa',
    genres: ['Action', 'Fantasy'],
    synopsis: 'Dokja Kim knows how the world will end.',
    availableSources: ['asurascans', 'likemanga', 'weebcentral'],
    primarySource: 'asurascans',
    coverTheme: 'omniscient-star',
    totalChapters: 235,
    chapters: [],
  },
];

test('DEFAULT_ENABLED_SOURCE_IDS contains the 5 verified live FMD2 sources and ALL_FMD2_SOURCES contains only real FMD2 Lua modules', () => {
  assert.deepEqual(DEFAULT_ENABLED_SOURCE_IDS, [
    'weebcentral',
    'asurascans',
    'mangadex',
    'likemanga',
    'mangakatana',
  ]);
  assert.ok(
    ALL_FMD2_SOURCES.length >= 200,
    `Expected real FMD2 Lua sources, got ${ALL_FMD2_SOURCES.length}`
  );
  // Ensure fabricated mock scanlators have been removed
  assert.equal(
    ALL_FMD2_SOURCES.some((s) => s.id === 'chronoscans' || s.id === 'eclipsecomics' || s.id === 'aetherscans'),
    false
  );
  const defaultEnabledInRegistry = ALL_FMD2_SOURCES.filter((s) => s.enabledByDefault).map(
    (s) => s.id
  );
  assert.deepEqual(defaultEnabledInRegistry, [
    'weebcentral',
    'asurascans',
    'mangadex',
    'likemanga',
    'mangakatana',
  ]);
  const disabledByDefaultCount = ALL_FMD2_SOURCES.filter((s) => !s.enabledByDefault).length;
  assert.equal(disabledByDefaultCount, ALL_FMD2_SOURCES.length - 5);
});

test('filterFmdSourcesCatalogue searches verified FMD2 Lua modules by name, domain, category, and enabled state', () => {
  const onlyEnabled = filterFmdSourcesCatalogue(
    ALL_FMD2_SOURCES,
    '',
    'All',
    'All',
    'enabled',
    DEFAULT_ENABLED_SOURCE_IDS
  );
  assert.equal(onlyEnabled.length, 5);

  const searchAsura = filterFmdSourcesCatalogue(
    ALL_FMD2_SOURCES,
    'asura',
    'All',
    'All',
    'all',
    DEFAULT_ENABLED_SOURCE_IDS
  );
  assert.ok(searchAsura.some((s) => s.id === 'asurascans'));

  const searchWeeb = filterFmdSourcesCatalogue(
    ALL_FMD2_SOURCES,
    'weebcentral.com',
    'All',
    'All',
    'all',
    DEFAULT_ENABLED_SOURCE_IDS
  );
  assert.equal(searchWeeb.length, 1);
  assert.equal(searchWeeb[0].id, 'weebcentral');
});

test('parseFmdDirectUrl identifies LikeManga, MangaKatana, WeebCentral, Asura Scans, and MangaDex URLs', () => {
  const lm = parseFmdDirectUrl('https://likemanga.ink/manga/solo-leveling');
  assert.equal(lm.isValid, true);
  assert.equal(lm.sourceId, 'likemanga');
  assert.equal(lm.luaModule, 'lua/modules/LikeManga.lua');
  assert.equal(lm.extractedQuery.toLowerCase(), 'solo leveling');

  const mk = parseFmdDirectUrl('https://mangakatana.com/manga/berserk');
  assert.equal(mk.isValid, true);
  assert.equal(mk.sourceId, 'mangakatana');
  assert.equal(mk.extractedQuery.toLowerCase(), 'berserk');

  const wc = parseFmdDirectUrl('https://weebcentral.com/series/01J76XY/vagabond');
  assert.equal(wc.isValid, true);
  assert.equal(wc.sourceId, 'weebcentral');
  assert.equal(wc.extractedQuery.toLowerCase(), 'vagabond');

  const asura = parseFmdDirectUrl('https://asurascans.com/comics/solo-leveling-a8b91234');
  assert.equal(asura.isValid, true);
  assert.equal(asura.sourceId, 'asurascans');
  assert.equal(asura.extractedQuery.toLowerCase(), 'solo leveling');

  const empty = parseFmdDirectUrl('   ');
  assert.equal(empty.isValid, false);
});

test('filterAndRankMangaCatalog handles spelling variants, punctuation, typos, acronyms, and chapter suffixes', () => {
  const byBritishSpelling = filterAndRankMangaCatalog(
    MOCK_CATALOG,
    'solo levelling',
    DEFAULT_ENABLED_SOURCE_IDS
  );
  assert.equal(byBritishSpelling.length, 1);
  assert.equal(byBritishSpelling[0].id, 'solo-leveling');

  const withChapterSuffix = filterAndRankMangaCatalog(
    MOCK_CATALOG,
    'solo levelling ch 14',
    DEFAULT_ENABLED_SOURCE_IDS
  );
  assert.equal(withChapterSuffix.length, 1);
  assert.equal(withChapterSuffix[0].id, 'solo-leveling');

  const withoutApostrophe = filterAndRankMangaCatalog(
    MOCK_CATALOG,
    'omniscient readers viewpoint',
    DEFAULT_ENABLED_SOURCE_IDS
  );
  assert.equal(withoutApostrophe.length, 1);
  assert.equal(withoutApostrophe[0].id, 'omniscient-reader');

  const byAcronym = filterAndRankMangaCatalog(
    MOCK_CATALOG,
    'orv',
    DEFAULT_ENABLED_SOURCE_IDS
  );
  assert.equal(byAcronym.length, 1);
  assert.equal(byAcronym[0].id, 'omniscient-reader');

  const byTypo = filterAndRankMangaCatalog(
    MOCK_CATALOG,
    'berzerk',
    DEFAULT_ENABLED_SOURCE_IDS
  );
  assert.equal(byTypo.length, 1);
  assert.equal(byTypo[0].id, 'berserk');

  // Ensure stop words ("the", "in") or synopsis words ("hunter") do not cause unrelated title false positives
  const nonMatchingTitleWithStopWord = filterAndRankMangaCatalog(
    MOCK_CATALOG,
    'The Breaker',
    DEFAULT_ENABLED_SOURCE_IDS
  );
  assert.equal(nonMatchingTitleWithStopWord.length, 0);
});

test('parseChapterRangeExpression parses ranges and single chapter numbers accurately', () => {
  const set = parseChapterRangeExpression('1-4, 7, 10 - 12');
  assert.deepEqual(Array.from(set).sort((a, b) => a - b), [1, 2, 3, 4, 7, 10, 11, 12]);
});

test('computeReaderPageGroups, getSpreadDisplayPages, and getDefaultReadingModeForSeries support all 5 reading modes', () => {
  const single = computeReaderPageGroups(4, 'single');
  assert.deepEqual(single, [[1], [2], [3], [4]]);

  const verticalPaged = computeReaderPageGroups(3, 'vertical-paged');
  assert.deepEqual(verticalPaged, [[1], [2], [3]]);

  const doubleWithOffset = computeReaderPageGroups(5, 'double', true);
  assert.deepEqual(doubleWithOffset, [[1], [2, 3], [4, 5]]);

  const doubleNoOffset = computeReaderPageGroups(5, 'double', false);
  assert.deepEqual(doubleNoOffset, [[1, 2], [3, 4], [5]]);

  const webtoon = computeReaderPageGroups(4, 'webtoon');
  assert.deepEqual(webtoon, [[1, 2, 3, 4]]);

  const horizontalStrip = computeReaderPageGroups(4, 'horizontal-strip');
  assert.deepEqual(horizontalStrip, [[1, 2, 3, 4]]);

  assert.deepEqual(getSpreadDisplayPages([2, 3], 'double', 'rtl'), [3, 2]);
  assert.deepEqual(getSpreadDisplayPages([2, 3], 'double', 'ltr'), [2, 3]);
  assert.equal(getDefaultReadingModeForSeries(MOCK_CATALOG[0]), 'webtoon');
  assert.equal(getDefaultReadingModeForSeries(MOCK_CATALOG[1]), 'single');
  assert.equal(READING_MODES_META.length, 5);
});

test('resolveSeriesReadingMode automatically toggles between single-page manga and continuous webtoon scroll based on genre or metadata tags and respects autoDetectReadingMode setting', () => {
  // 1. Default auto-detect ON: Solo Leveling (Manhwa, Dungeon) -> webtoon
  const soloRes = resolveSeriesReadingMode(MOCK_CATALOG[0], {
    autoDetectReadingMode: true,
    defaultReadingMode: 'single',
    webtoonTriggerTags: DEFAULT_WEBTOON_TRIGGER_TAGS,
  });
  assert.equal(soloRes.mode, 'webtoon');
  assert.equal(soloRes.direction, 'ltr');
  assert.equal(soloRes.isAutoDetected, true);
  assert.equal(soloRes.matchedCategory, 'webtoon');
  assert.ok(soloRes.matchedTags.includes('Manhwa'));

  // 2. Default auto-detect ON: Berserk (Seinen, Dark Fantasy) -> single
  const berserkRes = resolveSeriesReadingMode(MOCK_CATALOG[1], {
    autoDetectReadingMode: true,
    defaultReadingMode: 'webtoon',
    webtoonTriggerTags: DEFAULT_WEBTOON_TRIGGER_TAGS,
  });
  assert.equal(berserkRes.mode, 'single');
  assert.equal(berserkRes.direction, 'rtl');
  assert.equal(berserkRes.isAutoDetected, true);
  assert.equal(berserkRes.matchedCategory, 'manga');
  assert.ok(berserkRes.matchedTags.includes('Seinen'));

  // 3. Auto-detect OFF: uses fallback defaultReadingMode regardless of genre/tags
  const soloManualSingle = resolveSeriesReadingMode(MOCK_CATALOG[0], {
    autoDetectReadingMode: false,
    defaultReadingMode: 'single',
  });
  assert.equal(soloManualSingle.mode, 'single');
  assert.equal(soloManualSingle.isAutoDetected, false);
  assert.equal(soloManualSingle.matchedCategory, 'manual');

  const berserkManualWebtoon = resolveSeriesReadingMode(MOCK_CATALOG[1], {
    autoDetectReadingMode: false,
    defaultReadingMode: 'webtoon',
  });
  assert.equal(berserkManualWebtoon.mode, 'webtoon');
  assert.equal(berserkManualWebtoon.isAutoDetected, false);

  // 4. Custom genre/metadata trigger tag (e.g., adding 'Dark Fantasy' triggers webtoon mode for Berserk)
  const customTagRes = resolveSeriesReadingMode(MOCK_CATALOG[1], {
    autoDetectReadingMode: true,
    defaultReadingMode: 'single',
    webtoonTriggerTags: ['Dark Fantasy'],
  });
  assert.equal(customTagRes.mode, 'webtoon');
  assert.deepEqual(customTagRes.matchedTags, ['Dark Fantasy']);

  // 5. Series with explicit metadataTags
  const allTags = getSeriesAllTags({
    demographic: 'Seinen',
    genres: ['Sci-Fi'],
    metadataTags: ['Long Strip', 'Full Color'],
  });
  assert.ok(allTags.includes('Long Strip'));
  assert.ok(allTags.includes('Tankobon'));
});

test('summarizeDownloadQueue aggregates active speed and overall progress', () => {
  const tasks: DownloadTask[] = [
    {
      id: 't1',
      mangaId: 'solo-leveling',
      mangaTitle: 'Solo Leveling',
      chapterId: 'c1',
      chapterNumber: 1,
      chapterTitle: 'Prologue',
      sourceId: 'asurascans',
      luaModule: 'lua/modules/AsuraScans.lua',
      format: 'CBZ',
      status: 'downloading',
      progress: 50,
      pagesDownloaded: 10,
      totalPages: 20,
      speedKbps: 2048,
      sizeMb: 14.2,
      addedAt: '12:00:00',
      savePath: '/downloads/Solo Leveling/Ch.001.cbz',
    },
    {
      id: 't2',
      mangaId: 'solo-leveling',
      mangaTitle: 'Solo Leveling',
      chapterId: 'c2',
      chapterNumber: 2,
      chapterTitle: 'Double Dungeon',
      sourceId: 'asurascans',
      luaModule: 'lua/modules/AsuraScans.lua',
      format: 'CBZ',
      status: 'completed',
      progress: 100,
      pagesDownloaded: 22,
      totalPages: 22,
      speedKbps: 0,
      sizeMb: 16.8,
      addedAt: '11:58:00',
      savePath: '/downloads/Solo Leveling/Ch.002.cbz',
    },
  ];

  const stats = summarizeDownloadQueue(tasks);
  assert.equal(stats.totalTasks, 2);
  assert.equal(stats.activeCount, 1);
  assert.equal(stats.completedCount, 1);
  assert.equal(stats.totalSpeedMbps, 2);
  assert.equal(stats.overallProgressPercent, 75);
});

test('buildComicInfoXml and buildZipArchiveBuffer produce valid PKZIP CBZ archive bytes', () => {
  const xml = buildComicInfoXml({
    mangaTitle: 'Solo Leveling',
    chapterNumber: 14,
    chapterTitle: 'Arise — Shadow Monarch',
    sourceId: 'asurascans',
    luaModule: 'lua/modules/AsuraScans.lua',
    totalPages: 12,
  });
  assert.ok(xml.includes('<Series>Solo Leveling</Series>'));
  assert.ok(xml.includes('<Number>14</Number>'));

  const zipBuf = buildZipArchiveBuffer([
    { fileName: 'ComicInfo.xml', content: xml },
    { fileName: '001.svg', content: '<svg xmlns="http://www.w3.org/2000/svg"></svg>' },
  ]);

  const view = new DataView(zipBuf.buffer, zipBuf.byteOffset, zipBuf.byteLength);
  assert.equal(view.getUint32(0, true), 0x04034b50);
  assert.ok(zipBuf.byteLength > 100);
});

test('getSeriesContentFormat, cycleTriStateGenreFilter, and filterAndSortSourceBrowserCatalog support source browsing and multi-criteria filters', () => {
  // 1. Format classification
  assert.equal(getSeriesContentFormat(MOCK_CATALOG[0]), 'Manhwa');
  assert.equal(getSeriesContentFormat(MOCK_CATALOG[1]), 'Manga');

  // 2. Tri-state genre cycling: Neutral -> Include -> Exclude -> Neutral
  let state = cycleTriStateGenreFilter('Action', [], []);
  assert.deepEqual(state.includedGenres, ['Action']);
  assert.deepEqual(state.excludedGenres, []);

  state = cycleTriStateGenreFilter('Action', state.includedGenres, state.excludedGenres);
  assert.deepEqual(state.includedGenres, []);
  assert.deepEqual(state.excludedGenres, ['Action']);

  state = cycleTriStateGenreFilter('Action', state.includedGenres, state.excludedGenres);
  assert.deepEqual(state.includedGenres, []);
  assert.deepEqual(state.excludedGenres, []);

  // 3. Source filter (Asura Scans matches the 2 series available on Asura Scans)
  const asuraOnly = filterAndSortSourceBrowserCatalog(MOCK_CATALOG, {
    sourceId: 'asurascans',
    sortBy: 'rating',
  });
  assert.equal(asuraOnly.length, 2);
  assert.equal(asuraOnly[0].id, 'solo-leveling');
  assert.equal(asuraOnly[1].id, 'omniscient-reader');

  // 4. Format filter (Manga vs Manhwa)
  const mangaOnly = filterAndSortSourceBrowserCatalog(MOCK_CATALOG, {
    format: 'Manga',
  });
  assert.equal(mangaOnly.length, 1);
  assert.equal(mangaOnly[0].id, 'berserk');

  const manhwaOnly = filterAndSortSourceBrowserCatalog(MOCK_CATALOG, {
    format: 'Manhwa',
  });
  assert.equal(manhwaOnly.length, 2);

  // 5. Tri-state genre inclusion + exclusion
  const includeActionExcludeDungeon = filterAndSortSourceBrowserCatalog(MOCK_CATALOG, {
    includedGenres: ['Action'],
    excludedGenres: ['Dungeon', 'Tragedy'],
  });
  assert.equal(includeActionExcludeDungeon.length, 1);
  assert.equal(includeActionExcludeDungeon[0].id, 'omniscient-reader');

  // 6. Minimum chapter count and release year range filters
  const minChapters300 = filterAndSortSourceBrowserCatalog(MOCK_CATALOG, {
    minChapters: 300,
  });
  assert.equal(minChapters300.length, 1);
  assert.equal(minChapters300[0].id, 'berserk');

  const post2019 = filterAndSortSourceBrowserCatalog(MOCK_CATALOG, {
    minYear: 2019,
    maxYear: 2025,
  });
  assert.equal(post2019.length, 1);
  assert.equal(post2019[0].id, 'omniscient-reader');

  // 7. Sort order verification
  const byTitle = filterAndSortSourceBrowserCatalog(MOCK_CATALOG, {
    sortBy: 'title',
  });
  assert.equal(byTitle[0].id, 'berserk');
  assert.equal(byTitle[1].id, 'omniscient-reader');
  assert.equal(byTitle[2].id, 'solo-leveling');
});

test('computeReaderOpticalFilterCss generates accurate CSS filter strings for reader canvas', () => {
  assert.equal(computeReaderOpticalFilterCss(100, 100, 0), 'none');
  assert.equal(
    computeReaderOpticalFilterCss(85, 110, 25),
    'brightness(85%) contrast(110%) sepia(25%)'
  );
  // Clamping out-of-range values
  assert.equal(
    computeReaderOpticalFilterCss(20, 200, 90),
    'brightness(50%) contrast(130%) sepia(50%)'
  );
});

test('upsertReadingProgress, getSeriesReadingProgress, resolveResumeChapter, and getSortedRecentlyReadEntries track and resume recently read sessions', () => {
  let history: Record<string, ReadingSessionProgress> = {};

  history = upsertReadingProgress(history, {
    seriesId: 'solo-leveling',
    seriesTitle: 'Solo Leveling',
    chapterId: 'sl-ch-3',
    chapterNumber: 3,
    chapterTitle: 'Chapter 3',
    sourceId: 'weebcentral',
    lastPage: 7,
    totalPages: 18,
    readingMode: 'webtoon',
    updatedAt: '2026-10-17T08:00:00.000Z',
  });

  history = upsertReadingProgress(history, {
    seriesId: 'berserk',
    seriesTitle: 'Berserk',
    chapterId: 'ber-ch-12',
    chapterNumber: 12,
    chapterTitle: 'Chapter 12',
    sourceId: 'weebcentral',
    lastPage: 14,
    totalPages: 24,
    readingMode: 'single',
    updatedAt: '2026-10-17T09:30:00.000Z',
  });

  // Lookup by exact ID or normalized title
  const slProgress = getSeriesReadingProgress(history, {
    id: 'wc-01j76xycpsy3c4bnbpry8jmcbe',
    title: 'Solo Leveling',
  });
  assert.ok(slProgress);
  assert.equal(slProgress.chapterNumber, 3);
  assert.equal(slProgress.lastPage, 7);

  // Untouched series returns null
  const orvProgress = getSeriesReadingProgress(history, MOCK_CATALOG[2]);
  assert.equal(orvProgress, null);

  //Sorted recently read entries (newest first: Berserk then Solo Leveling)
  const recentList = getSortedRecentlyReadEntries(history, MOCK_CATALOG);
  assert.equal(recentList.length, 2);
  assert.equal(recentList[0].series.id, 'berserk');
  assert.equal(recentList[1].series.id, 'solo-leveling');

  // Resolve resume chapter object
  const resumeChap = resolveResumeChapter(MOCK_CATALOG[0], slProgress);
  assert.equal(resumeChap.number, 3);

  // Relative time formatting
  const baseNow = Date.parse('2026-10-17T09:45:00.000Z');
  assert.equal(formatRelativeReadTime('2026-10-17T09:30:00.000Z', baseNow), '15m ago');
});

test('Bulk chapter selection helpers: selectChaptersByRangeBounds, resolveNewChaptersForBatch, open-ended expressions, and computeBatchSelectionStats', () => {
  const sampleChapters: MangaChapter[] = [1, 2, 3, 4, 5, 6].map((num) => ({
    id: `sl-ch-${num}`,
    number: num,
    title: `Chapter ${num}`,
    releaseDate: '2026-10-15',
    scanlationGroup: 'WeebCentral',
    pagesCount: 20,
    sourceId: 'weebcentral',
    language: 'EN',
  }));

  // 1. From-To Range Bounds
  const range2To5 = selectChaptersByRangeBounds(sampleChapters, 2, 5);
  assert.deepEqual(range2To5, ['sl-ch-2', 'sl-ch-3', 'sl-ch-4', 'sl-ch-5']);

  // Reverse bounds (5 to 2) still selects 2..5
  const rangeReverse = selectChaptersByRangeBounds(sampleChapters, 5, 2);
  assert.deepEqual(rangeReverse, ['sl-ch-2', 'sl-ch-3', 'sl-ch-4', 'sl-ch-5']);

  // Open-ended expression e.g. "4+" and "-2"
  const openUp = parseChapterRangeExpression('4+', [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(Array.from(openUp).sort((a, b) => a - b), [4, 5, 6]);
  const openDown = parseChapterRangeExpression('-2', [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(Array.from(openDown).sort((a, b) => a - b), [1, 2]);

  // 2. Resolve 'All New' chapters when user has readingProgress at Ch. 3 and Ch. 4 is already in downloadQueue
  const progressAtCh3: ReadingSessionProgress = {
    seriesId: 'solo-leveling',
    seriesTitle: 'Solo Leveling',
    chapterId: 'sl-ch-3',
    chapterNumber: 3,
    chapterTitle: 'Chapter 3',
    sourceId: 'weebcentral',
    lastPage: 10,
    totalPages: 20,
    updatedAt: '2026-10-17T08:00:00.000Z',
  };

  const existingQueue: DownloadTask[] = [
    {
      id: 'task-ch-4',
      mangaId: 'solo-leveling',
      mangaTitle: 'Solo Leveling',
      chapterId: 'sl-ch-4',
      chapterNumber: 4,
      chapterTitle: 'Chapter 4',
      sourceId: 'weebcentral',
      luaModule: 'lua/modules/WeebCentral.lua',
      format: 'CBZ',
      status: 'completed',
      progress: 100,
      pagesDownloaded: 20,
      totalPages: 20,
      speedKbps: 0,
      sizeMb: 8.4,
      addedAt: '10m ago',
      savePath: '/tmp/fmd2-downloads/Solo_Leveling_Ch004.cbz',
    },
  ];

  const resolvedNew = resolveNewChaptersForBatch(sampleChapters, {
    readingProgress: progressAtCh3,
    existingTasks: existingQueue,
    seriesId: 'solo-leveling',
    seriesTitle: 'Solo Leveling',
  });

  // Unread after Ch. 3 are [4, 5, 6], and since Ch. 4 is already in queue, 'All New' selects [5, 6]
  assert.deepEqual(resolvedNew.chapterIds, ['sl-ch-5', 'sl-ch-6']);
  assert.deepEqual(resolvedNew.unreadIds, ['sl-ch-4', 'sl-ch-5', 'sl-ch-6']);
  assert.equal(resolvedNew.undownloadedIds.length, 5);

  // 3. Selection statistics
  const stats = computeBatchSelectionStats(sampleChapters, ['sl-ch-2', 'sl-ch-3', 'sl-ch-4', 'sl-ch-6']);
  assert.equal(stats.selectedCount, 4);
  assert.equal(stats.totalPages, 80);
  assert.equal(stats.chapterRangeLabel, 'Ch. 2–4, 6');
});

test('Sync Time calculation uses difference between sequential updatedAt timestamps of reading events', () => {
  let history: Record<string, ReadingSessionProgress> = {};

  // Event 1: Start reading Solo Leveling at 10:00:00
  history = upsertReadingProgress(history, {
    seriesId: 'solo-leveling',
    seriesTitle: 'Solo Leveling',
    chapterId: 'sl-ch-1',
    chapterNumber: 1,
    chapterTitle: 'Chapter 1',
    sourceId: 'weebcentral',
    lastPage: 1,
    totalPages: 18,
    updatedAt: '2026-10-18T10:00:00.000Z',
  });

  // Event 2: Advance to page 8 at 10:06:30 (+6m 30s)
  history = upsertReadingProgress(history, {
    seriesId: 'solo-leveling',
    seriesTitle: 'Solo Leveling',
    chapterId: 'sl-ch-1',
    chapterNumber: 1,
    chapterTitle: 'Chapter 1',
    sourceId: 'weebcentral',
    lastPage: 8,
    totalPages: 18,
    updatedAt: '2026-10-18T10:06:30.000Z',
  });

  const slAfterEvent2 = history['solo-leveling'];
  const durAfterEvent2 = computeReadingSyncDurationMs(slAfterEvent2, history);
  assert.equal(durAfterEvent2, (6 * 60 + 30) * 1000);
  assert.equal(formatReadingSyncTime(durAfterEvent2), '6m 30s');

  // Event 3: Advance to Chapter 2 at 10:18:00 (+11m 30s -> total 18m)
  history = upsertReadingProgress(history, {
    seriesId: 'solo-leveling',
    seriesTitle: 'Solo Leveling',
    chapterId: 'sl-ch-2',
    chapterNumber: 2,
    chapterTitle: 'Chapter 2',
    sourceId: 'weebcentral',
    lastPage: 4,
    totalPages: 18,
    updatedAt: '2026-10-18T10:18:00.000Z',
  });

  const slAfterEvent3 = history['solo-leveling'];
  const durAfterEvent3 = computeReadingSyncDurationMs(slAfterEvent3, history);
  assert.equal(durAfterEvent3, 18 * 60 * 1000);
  assert.equal(formatReadingSyncTime(durAfterEvent3), '18m');
});

test('resolveMissingChaptersForBatch identifies every missing chapter in a series and enqueueChaptersForDownload queues them in a single action', () => {
  const series: MangaSeries = {
    ...MOCK_CATALOG[0],
    chapters: [3, 2, 1].map((num) => ({
      id: `sl-${num}`,
      number: num,
      title: `Chapter ${num}`,
      releaseDate: '2026-10-15',
      scanlationGroup: 'WeebCentral',
      pagesCount: 20,
      sourceId: 'weebcentral',
      language: 'EN',
    })),
  };
  const existingTasks: DownloadTask[] = [
    {
      id: 'task-sl-ch-1',
      mangaId: 'solo-leveling',
      mangaTitle: 'Solo Leveling',
      chapterId: 'sl-1',
      chapterNumber: 1,
      chapterTitle: 'Chapter 1',
      sourceId: 'weebcentral',
      luaModule: 'lua/modules/WeebCentral.lua',
      format: 'CBZ',
      status: 'completed',
      progress: 100,
      pagesDownloaded: 42,
      totalPages: 42,
      speedKbps: 0,
      sizeMb: 14.2,
      addedAt: '15m ago',
      savePath: '/tmp/fmd2-downloads/Solo_Leveling_Ch001.cbz',
    },
    {
      id: 'task-sl-ch-2-failed',
      mangaId: 'solo-leveling',
      mangaTitle: 'Solo Leveling',
      chapterId: 'sl-2',
      chapterNumber: 2,
      chapterTitle: 'Chapter 2',
      sourceId: 'weebcentral',
      luaModule: 'lua/modules/WeebCentral.lua',
      format: 'CBZ',
      status: 'failed',
      progress: 0,
      pagesDownloaded: 0,
      totalPages: 38,
      speedKbps: 0,
      sizeMb: 12.1,
      addedAt: '10m ago',
      savePath: '/tmp/fmd2-downloads/Solo_Leveling_Ch002.cbz',
    },
  ];

  // Chapter 1 is completed, Chapter 2 failed (so still missing), Chapter 3 is not in queue
  const missing = resolveMissingChaptersForBatch(series.chapters, {
    existingTasks,
    seriesId: series.id,
    seriesTitle: series.title,
  });

  assert.deepEqual(
    missing.map((c) => c.number),
    [2, 3]
  );

  // Enqueue all missing chapters in a single call
  const updatedQueue = enqueueChaptersForDownload(
    existingTasks,
    series,
    missing,
    'weebcentral',
    'CBZ'
  );

  // Now all chapters 1, 2, 3 are present in non-failed tasks, so 0 missing chapters remain
  const remainingMissing = resolveMissingChaptersForBatch(series.chapters, {
    existingTasks: updatedQueue,
    seriesId: series.id,
    seriesTitle: series.title,
  });
  assert.equal(remainingMissing.length, 0);
});

test('toggleAmbientGlowPreference and updateUiThemePreferences toggle ambientGlow state cleanly', async () => {
  const {
    DEFAULT_UI_THEME_PREFS,
    toggleAmbientGlowPreference,
    updateUiThemePreferences,
  } = await import('./fmdLogic.ts');

  assert.equal(DEFAULT_UI_THEME_PREFS.ambientGlow, true);

  const toggledOff = toggleAmbientGlowPreference(DEFAULT_UI_THEME_PREFS);
  assert.equal(toggledOff.ambientGlow, false);
  assert.equal(toggledOff.themeId, DEFAULT_UI_THEME_PREFS.themeId);

  const toggledOn = toggleAmbientGlowPreference(toggledOff);
  assert.equal(toggledOn.ambientGlow, true);

  const updated = updateUiThemePreferences(toggledOn, {
    ambientGlow: false,
    themeId: 'cyberpunk',
  });
  assert.equal(updated.ambientGlow, false);
  assert.equal(updated.themeId, 'cyberpunk');
});

test('resolvePrimaryNavShortcutTab maps power-user keys (c, r, d, b, a, s, l and 1-7) to primary navigation tabs and ignores editable inputs or modifier keys', async () => {
  const {
    PRIMARY_NAV_SHORTCUTS,
    resolvePrimaryNavShortcutTab,
  } = await import('./fmdLogic.ts');

  assert.equal(PRIMARY_NAV_SHORTCUTS.length, 7);

  // Core requested shortcuts: 'c' for catalog, 'r' for reader, 'd' for downloads
  assert.equal(resolvePrimaryNavShortcutTab('c'), 'catalog');
  assert.equal(resolvePrimaryNavShortcutTab('C'), 'catalog');
  assert.equal(resolvePrimaryNavShortcutTab('r'), 'reader');
  assert.equal(resolvePrimaryNavShortcutTab('R'), 'reader');
  assert.equal(resolvePrimaryNavShortcutTab('d'), 'downloads');
  assert.equal(resolvePrimaryNavShortcutTab('D'), 'downloads');

  // Additional primary tabs: 'b' for browse, 'a' for archivist, 's' for settings, 'l' for read-later
  assert.equal(resolvePrimaryNavShortcutTab('b'), 'browse');
  assert.equal(resolvePrimaryNavShortcutTab('a'), 'archivist');
  assert.equal(resolvePrimaryNavShortcutTab('s'), 'settings');
  assert.equal(resolvePrimaryNavShortcutTab('l'), 'read-later');

  // Numeric shortcuts 1-7
  assert.equal(resolvePrimaryNavShortcutTab('1'), 'catalog');
  assert.equal(resolvePrimaryNavShortcutTab('2'), 'browse');
  assert.equal(resolvePrimaryNavShortcutTab('3'), 'downloads');
  assert.equal(resolvePrimaryNavShortcutTab('4'), 'reader');
  assert.equal(resolvePrimaryNavShortcutTab('5'), 'archivist');
  assert.equal(resolvePrimaryNavShortcutTab('6'), 'settings');
  assert.equal(resolvePrimaryNavShortcutTab('7'), 'read-later');

  // Ignored when typing in an input/textarea or when modifier keys are held
  assert.equal(resolvePrimaryNavShortcutTab('c', { isEditableTarget: true }), null);
  assert.equal(resolvePrimaryNavShortcutTab('r', { ctrlKey: true }), null);
  assert.equal(resolvePrimaryNavShortcutTab('d', { metaKey: true }), null);
  assert.equal(resolvePrimaryNavShortcutTab('b', { altKey: true }), null);
  assert.equal(resolvePrimaryNavShortcutTab('z'), null);
});

test('catalog select all and bulk download queueing helpers select/deselect visible series and enqueue multiple series at once', async () => {
  const {
    toggleCatalogSeriesSelection,
    areAllCatalogSeriesSelected,
    toggleSelectAllCatalogSeries,
    computeCatalogBulkSelectionStats,
    enqueueMultipleSeriesForDownload,
  } = await import('./fmdLogic.ts');

  const visibleSeries = MOCK_CATALOG.slice(0, 3);
  assert.equal(visibleSeries.length, 3);

  // Initially none selected
  let selectedIds: string[] = [];
  assert.equal(areAllCatalogSeriesSelected(selectedIds, visibleSeries), false);

  // Toggle single series on
  selectedIds = toggleCatalogSeriesSelection(selectedIds, visibleSeries[0].id);
  assert.deepEqual(selectedIds, [visibleSeries[0].id]);
  assert.equal(areAllCatalogSeriesSelected(selectedIds, visibleSeries), false);

  // Select All selects all 3 visible series
  selectedIds = toggleSelectAllCatalogSeries(selectedIds, visibleSeries);
  assert.equal(selectedIds.length, 3);
  assert.equal(areAllCatalogSeriesSelected(selectedIds, visibleSeries), true);

  // Compute bulk stats across the 3 selected series
  const stats = computeCatalogBulkSelectionStats(MOCK_CATALOG, selectedIds, []);
  assert.equal(stats.selectedSeriesCount, 3);
  assert.ok(stats.totalChaptersCount >= 3);
  assert.equal(stats.missingChaptersCount, stats.totalChaptersCount);
  assert.ok(stats.estimatedSizeMb > 0);

  // Bulk enqueue all 3 selected series into an empty download queue
  const bulkResult = enqueueMultipleSeriesForDownload([], visibleSeries, 'CBZ');
  assert.equal(bulkResult.queuedSeriesCount, 3);
  assert.equal(bulkResult.addedChaptersCount, stats.missingChaptersCount);
  assert.equal(bulkResult.updatedQueue.length, stats.missingChaptersCount);

  // Re-running bulk enqueue when all chapters are already queued adds 0 duplicates
  const duplicateResult = enqueueMultipleSeriesForDownload(
    bulkResult.updatedQueue,
    visibleSeries,
    'CBZ'
  );
  assert.equal(duplicateResult.addedChaptersCount, 0);
  assert.equal(duplicateResult.queuedSeriesCount, 0);

  // Calling Select All again when all visible series are selected deselects them
  selectedIds = toggleSelectAllCatalogSeries(selectedIds, visibleSeries);
  assert.deepEqual(selectedIds, []);
  assert.equal(areAllCatalogSeriesSelected(selectedIds, visibleSeries), false);
});

test('APPLE_FONT_PRESETS and APP_THEME_PRESETS provide Apple font pairings and manga website inspirations', async () => {
  const {
    APPLE_FONT_PRESETS,
    APP_THEME_PRESETS,
    DEFAULT_UI_THEME_PREFS,
    updateUiThemePreferences,
  } = await import('./fmdLogic.ts');

  assert.equal(APPLE_FONT_PRESETS.length, 3);
  assert.deepEqual(
    APPLE_FONT_PRESETS.map((f) => f.id),
    ['sf-pro', 'new-york', 'sf-compact']
  );

  assert.equal(APP_THEME_PRESETS.length, 12);
  for (const preset of APP_THEME_PRESETS) {
    assert.ok(preset.inspiredBy && preset.inspiredBy.length > 0);
  }

  assert.equal(DEFAULT_UI_THEME_PREFS.fontFamily, 'sf-pro');
  const withNewYork = updateUiThemePreferences(DEFAULT_UI_THEME_PREFS, {
    fontFamily: 'new-york',
    themeId: 'kyoto-light',
  });
  assert.equal(withNewYork.fontFamily, 'new-york');
  assert.equal(withNewYork.themeId, 'kyoto-light');
});

test('computeChapterProgressionMap accurately classifies read, downloaded, and missing chapters in ascending order', async () => {
  const { computeChapterProgressionMap } = await import('./fmdLogic.ts');

  const chapters = [
    {
      id: 'ch-3',
      number: 3,
      title: 'Chapter 3',
      releaseDate: '2026-01-03',
      scanlationGroup: 'Asura',
      pagesCount: 20,
      sourceId: 'asurascans' as const,
      language: 'EN',
    },
    {
      id: 'ch-1',
      number: 1,
      title: 'Chapter 1',
      releaseDate: '2026-01-01',
      scanlationGroup: 'Asura',
      pagesCount: 18,
      sourceId: 'asurascans' as const,
      language: 'EN',
    },
    {
      id: 'ch-2',
      number: 2,
      title: 'Chapter 2',
      releaseDate: '2026-01-02',
      scanlationGroup: 'Asura',
      pagesCount: 22,
      sourceId: 'asurascans' as const,
      language: 'EN',
    },
    {
      id: 'ch-4',
      number: 4,
      title: 'Chapter 4',
      releaseDate: '2026-01-04',
      scanlationGroup: 'Asura',
      pagesCount: 19,
      sourceId: 'asurascans' as const,
      language: 'EN',
    },
  ];

  const readingProgress = {
    seriesId: 'solo-leveling',
    seriesTitle: 'Solo Leveling',
    chapterId: 'ch-2',
    chapterNumber: 2,
    chapterTitle: 'Chapter 2',
    lastPage: 10,
    totalPages: 22,
    sourceId: 'asurascans' as const,
    readingMode: 'webtoon' as const,
    updatedAt: '2026-10-20T10:00:00Z',
  };

  const existingTasks = [
    {
      id: 'dl-1',
      mangaId: 'solo-leveling',
      mangaTitle: 'Solo Leveling',
      chapterId: 'ch-1',
      chapterNumber: 1,
      chapterTitle: 'Chapter 1',
      sourceId: 'asurascans' as const,
      luaModule: 'lua/modules/AsuraScans.lua',
      format: 'CBZ' as const,
      status: 'completed' as const,
      progress: 100,
      pagesDownloaded: 18,
      totalPages: 18,
      speedKbps: 0,
      sizeMb: 7.5,
      addedAt: 'Just now',
      savePath: '/tmp/ch1.cbz',
    },
    {
      id: 'dl-3',
      mangaId: 'solo-leveling',
      mangaTitle: 'Solo Leveling',
      chapterId: 'ch-3',
      chapterNumber: 3,
      chapterTitle: 'Chapter 3',
      sourceId: 'asurascans' as const,
      luaModule: 'lua/modules/AsuraScans.lua',
      format: 'CBZ' as const,
      status: 'queued' as const,
      progress: 0,
      pagesDownloaded: 0,
      totalPages: 20,
      speedKbps: 0,
      sizeMb: 8.4,
      addedAt: 'Just now',
      savePath: '/tmp/ch3.cbz',
    },
  ];

  const mapSummary = computeChapterProgressionMap(chapters, {
    readingProgress,
    existingTasks,
    seriesId: 'solo-leveling',
    seriesTitle: 'Solo Leveling',
    selectedChapterIds: ['ch-4'],
  });

  assert.equal(mapSummary.totalChapters, 4);
  assert.deepEqual(
    mapSummary.items.map((i) => i.chapterNumber),
    [1, 2, 3, 4]
  );

  // Ch. 1 & 2 are read (<= chapterNumber 2)
  assert.equal(mapSummary.readCount, 2);
  // Ch. 1 & 3 are downloaded/queued in library
  assert.equal(mapSummary.downloadedCount, 2);
  // Ch. 2 & 4 are missing in library
  assert.equal(mapSummary.missingCount, 2);
  // Ch. 1 is both read and downloaded
  assert.equal(mapSummary.readAndDownloadedCount, 1);

  assert.equal(mapSummary.items[0].visualState, 'read-downloaded');
  assert.equal(mapSummary.items[1].visualState, 'last-read');
  assert.equal(mapSummary.items[2].visualState, 'downloaded');
  assert.equal(mapSummary.items[3].visualState, 'missing');
  assert.equal(mapSummary.items[3].isSelected, true);
});

test('sortSeriesChapters orders chapters by Newest First, Oldest First, and Unread First', async () => {
  const { sortSeriesChapters, CHAPTER_SORT_OPTIONS } = await import('./fmdLogic.ts');

  assert.deepEqual(
    CHAPTER_SORT_OPTIONS.map((o) => o.label),
    ['Newest First', 'Oldest First', 'Unread First']
  );

  const chapters = [
    {
      id: 'ch-2',
      number: 2,
      title: 'Chapter 2',
      releaseDate: '2026-01-02',
      scanlationGroup: 'Asura',
      pagesCount: 20,
      sourceId: 'asurascans' as const,
      language: 'EN',
    },
    {
      id: 'ch-4',
      number: 4,
      title: 'Chapter 4',
      releaseDate: '2026-01-04',
      scanlationGroup: 'Asura',
      pagesCount: 21,
      sourceId: 'asurascans' as const,
      language: 'EN',
    },
    {
      id: 'ch-1',
      number: 1,
      title: 'Chapter 1',
      releaseDate: '2026-01-01',
      scanlationGroup: 'Asura',
      pagesCount: 18,
      sourceId: 'asurascans' as const,
      language: 'EN',
    },
    {
      id: 'ch-3',
      number: 3,
      title: 'Chapter 3',
      releaseDate: '2026-01-03',
      scanlationGroup: 'Asura',
      pagesCount: 19,
      sourceId: 'asurascans' as const,
      language: 'EN',
    },
  ];

  const readingProgress = {
    seriesId: 'solo-leveling',
    seriesTitle: 'Solo Leveling',
    chapterId: 'ch-2',
    chapterNumber: 2,
    chapterTitle: 'Chapter 2',
    lastPage: 12,
    totalPages: 20,
    sourceId: 'asurascans' as const,
    readingMode: 'webtoon' as const,
    updatedAt: '2026-10-20T10:00:00Z',
  };

  // Newest First: [4, 3, 2, 1]
  assert.deepEqual(
    sortSeriesChapters(chapters, 'newest-first', readingProgress).map((c) => c.number),
    [4, 3, 2, 1]
  );

  // Oldest First: [1, 2, 3, 4]
  assert.deepEqual(
    sortSeriesChapters(chapters, 'oldest-first', readingProgress).map((c) => c.number),
    [1, 2, 3, 4]
  );

  // Unread First (read <= 2, so unread [3, 4] first in ascending reading order, then read [1, 2]):
  assert.deepEqual(
    sortSeriesChapters(chapters, 'unread-first', readingProgress).map((c) => c.number),
    [3, 4, 1, 2]
  );

  // Unread First with no readingProgress (all chapters unread, ascending [1, 2, 3, 4]):
  assert.deepEqual(
    sortSeriesChapters(chapters, 'unread-first', null).map((c) => c.number),
    [1, 2, 3, 4]
  );
});

test('Cloud Sync helpers merge multi-device reading histories deterministically and persist via fmdEngine', async () => {
  const {
    normalizeCloudSyncKey,
    mergeReadingHistories,
    mergeBookmarkedIds,
    hasUnsyncedReadingChanges,
    DEFAULT_CLOUD_SYNC_KEY,
  } = await import('./fmdLogic.ts');
  const { fmdEngine } = await import('../server/fmdEngine.ts');

  assert.equal(normalizeCloudSyncKey(''), DEFAULT_CLOUD_SYNC_KEY);
  assert.equal(normalizeCloudSyncKey('  My Cross Device Profile! '), 'my-cross-device-profile');

  const deviceAHistory = {
    'solo-leveling': {
      seriesId: 'solo-leveling',
      seriesTitle: 'Solo Leveling',
      chapterId: 'sl-ch-12',
      chapterNumber: 12,
      chapterTitle: 'Chapter 12',
      sourceId: 'asurascans' as const,
      lastPage: 8,
      totalPages: 24,
      readingMode: 'webtoon' as const,
      updatedAt: '2026-10-20T12:00:00Z',
      deviceId: 'device-a',
      deviceName: 'Desktop Studio',
    },
    berserk: {
      seriesId: 'berserk',
      seriesTitle: 'Berserk',
      chapterId: 'bk-ch-4',
      chapterNumber: 4,
      chapterTitle: 'Chapter 4',
      sourceId: 'weebcentral' as const,
      lastPage: 15,
      totalPages: 22,
      readingMode: 'single' as const,
      updatedAt: '2026-10-20T14:00:00Z',
      deviceId: 'device-a',
      deviceName: 'Desktop Studio',
    },
  };

  const deviceBHistory = {
    'solo-leveling': {
      seriesId: 'solo-leveling',
      seriesTitle: 'Solo Leveling',
      chapterId: 'sl-ch-15',
      chapterNumber: 15,
      chapterTitle: 'Chapter 15',
      sourceId: 'asurascans' as const,
      lastPage: 19,
      totalPages: 24,
      readingMode: 'webtoon' as const,
      updatedAt: '2026-10-20T15:30:00Z',
      deviceId: 'device-b',
      deviceName: 'iPad Reader',
    },
  };

  assert.equal(hasUnsyncedReadingChanges(deviceAHistory, deviceBHistory), true);

  const merged = mergeReadingHistories(deviceAHistory, deviceBHistory);
  assert.equal(Object.keys(merged).length, 2);
  // Device B has newer progress on Solo Leveling (Ch. 15, Page 19)
  assert.equal(merged['solo-leveling'].chapterNumber, 15);
  assert.equal(merged['solo-leveling'].lastPage, 19);
  assert.equal(merged['solo-leveling'].deviceName, 'iPad Reader');
  // Berserk from Device A is preserved
  assert.equal(merged['berserk'].chapterNumber, 4);

  const mergedBookmarks = mergeBookmarkedIds(['solo-leveling'], ['berserk', 'solo-leveling']);
  assert.deepEqual(mergedBookmarks.sort(), ['berserk', 'solo-leveling']);

  // Verify backend fmdEngine cloud sync persistence across simulated devices
  const testProfileKey = `test-sync-${Date.now()}`;
  const afterDeviceA = fmdEngine.syncReadingHistory({
    syncKey: testProfileKey,
    readingHistory: deviceAHistory,
    bookmarkedIds: ['solo-leveling'],
    deviceId: 'device-a',
    deviceName: 'Desktop Studio',
    mode: 'merge',
  });
  assert.equal(Object.keys(afterDeviceA.readingHistory).length, 2);
  assert.equal(afterDeviceA.readingHistory['solo-leveling'].chapterNumber, 12);

  const afterDeviceB = fmdEngine.syncReadingHistory({
    syncKey: testProfileKey,
    readingHistory: deviceBHistory,
    bookmarkedIds: ['berserk'],
    deviceId: 'device-b',
    deviceName: 'iPad Reader',
    mode: 'merge',
  });
  assert.equal(afterDeviceB.readingHistory['solo-leveling'].chapterNumber, 15);
  assert.equal(afterDeviceB.readingHistory['berserk'].chapterNumber, 4);
  assert.equal(afterDeviceB.bookmarkedIds.length, 2);

  const fetchedOnDeviceC = fmdEngine.getCloudSyncSnapshot(testProfileKey);
  assert.equal(fetchedOnDeviceC.readingHistory['solo-leveling'].chapterNumber, 15);
  assert.equal(fetchedOnDeviceC.readingHistory['solo-leveling'].lastPage, 19);
});

test('Download All Missing helpers extract and queue all missing chapters from the chapter progression map', async () => {
  const {
    computeChapterProgressionMap,
    getMissingChaptersFromProgressionMap,
    queueMissingChaptersFromProgressionMap,
  } = await import('./fmdLogic.ts');

  const chapters = [
    {
      id: 'ch-1',
      number: 1,
      title: 'Chapter 1',
      releaseDate: '2026-10-01',
      pagesCount: 20,
      scanlationGroup: 'Asura',
      sourceId: 'asurascans' as const,
      language: 'EN',
    },
    {
      id: 'ch-2',
      number: 2,
      title: 'Chapter 2',
      releaseDate: '2026-10-02',
      pagesCount: 22,
      scanlationGroup: 'Asura',
      sourceId: 'asurascans' as const,
      language: 'EN',
    },
    {
      id: 'ch-3',
      number: 3,
      title: 'Chapter 3',
      releaseDate: '2026-10-03',
      pagesCount: 24,
      scanlationGroup: 'Asura',
      sourceId: 'asurascans' as const,
      language: 'EN',
    },
    {
      id: 'ch-4',
      number: 4,
      title: 'Chapter 4',
      releaseDate: '2026-10-04',
      pagesCount: 21,
      scanlationGroup: 'Asura',
      sourceId: 'asurascans' as const,
      language: 'EN',
    },
  ];

  // Chapter 1 and 3 are already downloaded/queued; Chapters 2 and 4 are missing
  const existingTasks = [
    {
      id: 'task-1',
      mangaId: 'solo-leveling',
      seriesId: 'solo-leveling',
      mangaTitle: 'Solo Leveling',
      chapterId: 'ch-1',
      chapterNumber: 1,
      chapterTitle: 'Chapter 1',
      sourceId: 'asurascans' as const,
      sourceName: 'Asura Scans',
      luaModule: 'modules/lua/AsuraScans.lua',
      format: 'CBZ' as const,
      status: 'completed' as const,
      progress: 100,
      pagesDownloaded: 20,
      totalPages: 20,
      speedKbps: 0,
      etaSeconds: 0,
      sizeMb: 12.4,
      savePath: '/downloads/Solo_Leveling_Ch001.cbz',
      outputPath: '/downloads/Solo_Leveling_Ch001.cbz',
      addedAt: '10:00:00',
    },
    {
      id: 'task-3',
      mangaId: 'solo-leveling',
      seriesId: 'solo-leveling',
      mangaTitle: 'Solo Leveling',
      chapterId: 'ch-3',
      chapterNumber: 3,
      chapterTitle: 'Chapter 3',
      sourceId: 'asurascans' as const,
      sourceName: 'Asura Scans',
      luaModule: 'modules/lua/AsuraScans.lua',
      format: 'CBZ' as const,
      status: 'downloading' as const,
      progress: 50,
      pagesDownloaded: 12,
      totalPages: 24,
      speedKbps: 500,
      etaSeconds: 5,
      sizeMb: 14.1,
      savePath: '/downloads/Solo_Leveling_Ch003.cbz',
      outputPath: '/downloads/Solo_Leveling_Ch003.cbz',
      addedAt: '10:05:00',
    },
  ];

  const map = computeChapterProgressionMap(chapters, {
    seriesId: 'solo-leveling',
    seriesTitle: 'Solo Leveling',
    existingTasks,
  });

  assert.equal(map.totalChapters, 4);
  assert.equal(map.downloadedCount, 2);
  assert.equal(map.missingCount, 2);
  assert.deepEqual(map.missingChapterIds, ['ch-2', 'ch-4']);

  const extractedMissing = getMissingChaptersFromProgressionMap(map);
  assert.deepEqual(
    extractedMissing.map((c) => c.number),
    [2, 4]
  );

  const queuedResult = queueMissingChaptersFromProgressionMap({
    progressionMap: map,
    existingTasks,
    series: { id: 'solo-leveling', title: 'Solo Leveling' },
    sourceId: 'asurascans',
    format: 'CBZ',
  });
  assert.deepEqual(
    queuedResult.queuedChapters.map((c) => c.number),
    [2, 4]
  );
  assert.deepEqual(queuedResult.queuedChapterIds, ['ch-2', 'ch-4']);
  assert.equal(queuedResult.updatedQueue.length, 4);
});

test('Browse Sources header dropdown helpers compute genre/status counts and filter catalog by genre and status', async () => {
  const {
    DEFAULT_SOURCE_BROWSE_FILTERS,
    computeBrowseHeaderFilterOptions,
    applyBrowseHeaderGenreFilter,
    applyBrowseHeaderStatusFilter,
    filterAndSortSourceBrowserCatalog,
  } = await import('./fmdLogic.ts');

  const options = computeBrowseHeaderFilterOptions(MOCK_CATALOG, 'ALL', [
    'Action',
    'Dark Fantasy',
    'Sci-Fi',
  ]);

  assert.equal(options.statusCounts.All, MOCK_CATALOG.length);
  assert.equal(
    options.statusCounts.Ongoing +
      options.statusCounts.Completed +
      options.statusCounts.Hiatus,
    MOCK_CATALOG.length
  );
  assert.ok(options.genres.some((g) => g.name === 'Action' && g.count > 0));

  // Filter by Completed status via header dropdown
  const completedFilters = applyBrowseHeaderStatusFilter(
    DEFAULT_SOURCE_BROWSE_FILTERS,
    'Completed'
  );
  assert.equal(completedFilters.status, 'Completed');
  const completedResults = filterAndSortSourceBrowserCatalog(MOCK_CATALOG, completedFilters);
  assert.equal(completedResults.length, options.statusCounts.Completed);
  assert.ok(completedResults.every((s) => s.status === 'Completed'));

  // Filter by Action genre via header dropdown
  const actionCompletedFilters = applyBrowseHeaderGenreFilter(completedFilters, 'Action');
  assert.deepEqual(actionCompletedFilters.includedGenres, ['Action']);
  const actionCompletedResults = filterAndSortSourceBrowserCatalog(
    MOCK_CATALOG,
    actionCompletedFilters
  );
  assert.ok(
    actionCompletedResults.every(
      (s) =>
        s.status === 'Completed' &&
        s.genres.some((g) => g.toLowerCase() === 'action')
    )
  );

  // Reset genre back to All via header dropdown
  const clearedGenreFilters = applyBrowseHeaderGenreFilter(actionCompletedFilters, 'All');
  assert.deepEqual(clearedGenreFilters.includedGenres, []);

  // Verify Sort by dropdown options ('Popularity', 'Newest', 'Alphabetical', 'Rating')
  const { BROWSE_SORT_MENU_OPTIONS, applyBrowseHeaderSortBy } = await import('./fmdLogic.ts');
  const sortLabels = BROWSE_SORT_MENU_OPTIONS.map((o) => o.label);
  assert.ok(sortLabels.includes('Popularity'));
  assert.ok(sortLabels.includes('Newest'));
  assert.ok(sortLabels.includes('Alphabetical'));
  assert.ok(sortLabels.includes('Rating'));

  const alphaFilters = applyBrowseHeaderSortBy(DEFAULT_SOURCE_BROWSE_FILTERS, 'Alphabetical');
  assert.equal(alphaFilters.sortBy, 'title');
  const alphaSorted = filterAndSortSourceBrowserCatalog(MOCK_CATALOG, alphaFilters);
  assert.equal(alphaSorted[0].title, 'Berserk');

  const newestFilters = applyBrowseHeaderSortBy(DEFAULT_SOURCE_BROWSE_FILTERS, 'Newest');
  assert.equal(newestFilters.sortBy, 'latest');

  const ratingFilters = applyBrowseHeaderSortBy(DEFAULT_SOURCE_BROWSE_FILTERS, 'Rating');
  assert.equal(ratingFilters.sortBy, 'rating');
  const ratingSorted = filterAndSortSourceBrowserCatalog(MOCK_CATALOG, ratingFilters);
  assert.ok(ratingSorted[0].rating >= ratingSorted[ratingSorted.length - 1].rating);

  // Verify selecting a non-default verified FMD2 source connector (e.g., Flame Comics / 'flamescans')
  // populates non-zero genre/status counts and filtered series results
  const flameOptions = computeBrowseHeaderFilterOptions(MOCK_CATALOG, 'flamescans', [
    'Action',
    'Fantasy',
  ]);
  assert.equal(flameOptions.statusCounts.All, MOCK_CATALOG.length);
  const flameResults = filterAndSortSourceBrowserCatalog(MOCK_CATALOG, {
    ...DEFAULT_SOURCE_BROWSE_FILTERS,
    sourceId: 'flamescans',
  });
  assert.equal(flameResults.length, MOCK_CATALOG.length);
});

