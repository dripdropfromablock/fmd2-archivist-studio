import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Search,
  BookOpen,
  Download,
  RotateCcw,
  SlidersHorizontal,
  Globe,
  Check,
  Plus,
  Minus,
  ArrowUpDown,
  RefreshCw,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Star,
  Play,
  History,
  Cloud,
  X,
} from 'lucide-react';
import {
  ALL_FMD2_SOURCES,
  DEFAULT_SOURCE_BROWSE_FILTERS,
  filterAndSortSourceBrowserCatalog,
  cycleTriStateGenreFilter,
  getSeriesContentFormat,
  resolveSeriesReadingMode,
  seriesSupportsSource,
  getSeriesReadingProgress,
  formatRelativeReadTime,
  computeReadingSyncDurationMs,
  formatReadingSyncTime,
  computeBrowseHeaderFilterOptions,
  applyBrowseHeaderGenreFilter,
  applyBrowseHeaderStatusFilter,
  applyBrowseHeaderSortBy,
  normalizeBrowseSortOption,
  BROWSE_SORT_MENU_OPTIONS,
  type MangaSeries,
  type SourceId,
  type FmdEngineConfig,
  type SourceBrowseFilters,
  type BrowseFormatFilter,
  type BrowseDemographicFilter,
  type BrowseStatusFilter,
  type BrowseSortOption,
  type ReadingSessionProgress,
  type CloudSyncStatus,
} from '../utils/fmdLogic.ts';
import { MangaCoverArt } from './MangaArtRenderer.tsx';
import { DropdownMenu, type DropdownMenuItem } from './DropdownMenu.tsx';

interface BrowseSourcesViewProps {
  catalog: MangaSeries[];
  enabledSources: SourceId[];
  engineConfig: FmdEngineConfig;
  readingHistory?: Record<string, ReadingSessionProgress>;
  recentlyReadEntries?: { series: MangaSeries; progress: ReadingSessionProgress }[];
  onResumeSeries?: (series: MangaSeries, progress: ReadingSessionProgress) => void;
  onClearReadingProgress?: (seriesId: string) => void;
  onClearAllReadingProgress?: () => void;
  onOpenCloudSync?: () => void;
  cloudSyncStatus?: CloudSyncStatus;
  externalSearchQuery?: string;
  onToggleEnableSource: (sourceId: SourceId) => void;
  onReadSeriesOnSource: (series: MangaSeries, sourceId: SourceId) => void;
  onInspectSeries: (series: MangaSeries) => void;
  onMergeLiveSeries?: (seriesList: MangaSeries[]) => void;
}

const FORMAT_OPTIONS: BrowseFormatFilter[] = ['All', 'Manga', 'Manhwa', 'Manhua', 'Webtoon'];
const DEMOGRAPHIC_OPTIONS: BrowseDemographicFilter[] = [
  'All',
  'Seinen',
  'Shounen',
  'Shoujo',
  'Josei',
  'Manhwa',
  'Webtoon',
];
const STATUS_OPTIONS: BrowseStatusFilter[] = ['All', 'Ongoing', 'Completed', 'Hiatus'];
const MIN_CHAPTER_PRESETS = [
  { label: 'Any Count', value: 0 },
  { label: '10+ Chapters', value: 10 },
  { label: '50+ Chapters', value: 50 },
  { label: '100+ Chapters', value: 100 },
  { label: '200+ Chapters', value: 200 },
  { label: '300+ Chapters', value: 300 },
];

const CANONICAL_BROWSE_GENRES: string[] = [
  'Action',
  'Adventure',
  'Comedy',
  'Dark Fantasy',
  'Drama',
  'Dungeon',
  'Fantasy',
  'Historical',
  'Horror',
  'Isekai',
  'Magic',
  'Martial Arts',
  'Murim',
  'Mystery',
  'Necromancer',
  'Psychological',
  'Reincarnation',
  'Romance',
  'School Life',
  'Sci-Fi',
  'Slice of Life',
  'Sports',
  'Supernatural',
  'Thriller',
];

function isLiveScrapedSeries(s: MangaSeries): boolean {
  return (
    s.id.startsWith('wc-') ||
    s.id.startsWith('as-') ||
    s.id.startsWith('md-') ||
    s.id.startsWith('lm-') ||
    s.id.startsWith('mk-')
  );
}

export const BrowseSourcesView: React.FC<BrowseSourcesViewProps> = ({
  catalog,
  enabledSources,
  engineConfig,
  readingHistory = {},
  recentlyReadEntries = [],
  onResumeSeries,
  onClearReadingProgress,
  onClearAllReadingProgress,
  onOpenCloudSync,
  cloudSyncStatus = 'synced',
  externalSearchQuery = '',
  onToggleEnableSource,
  onReadSeriesOnSource,
  onInspectSeries,
  onMergeLiveSeries,
}) => {
  const [filters, setFilters] = useState<SourceBrowseFilters>(() => ({
    ...DEFAULT_SOURCE_BROWSE_FILTERS,
    searchQuery: externalSearchQuery,
  }));
  const [sourceSearch, setSourceSearch] = useState('');
  const [showEnabledSourcesOnly, setShowEnabledSourcesOnly] = useState(false);
  const [visibleSourcesLimit, setVisibleSourcesLimit] = useState(25);
  const [visibleCardsLimit, setVisibleCardsLimit] = useState(30);
  const [showAllGenres, setShowAllGenres] = useState(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  useEffect(() => {
    if (externalSearchQuery && externalSearchQuery !== filters.searchQuery) {
      setFilters((prev) => ({ ...prev, searchQuery: externalSearchQuery }));
    }
  }, [externalSearchQuery]);

  useEffect(() => {
    setVisibleCardsLimit(30);
  }, [filters.sourceId, filters.searchQuery, filters.sortBy, filters.status, filters.format]);

  // Cumulative real live series fetched from /api/manga/browse
  const [liveSeriesMap, setLiveSeriesMap] = useState<Map<string, MangaSeries>>(() => {
    const initial = new Map<string, MangaSeries>();
    for (const item of catalog) {
      if (isLiveScrapedSeries(item)) {
        initial.set(item.id, item);
      }
    }
    return initial;
  });
  const [isLoadingLive, setIsLoadingLive] = useState<boolean>(false);
  const [livePageBySource, setLivePageBySource] = useState<Record<string, number>>({
    ALL: 1,
  });
  const [lastSyncedLabel, setLastSyncedLabel] = useState<string>('Syncing live upstream feeds...');

  const mergeIncomingSeries = useCallback(
    (incoming: MangaSeries[]) => {
      if (!Array.isArray(incoming) || incoming.length === 0) return;
      setLiveSeriesMap((prev) => {
        const next = new Map(prev);
        for (const item of incoming) {
          const existing = next.get(item.id);
          if (existing) {
            next.set(item.id, {
              ...existing,
              ...item,
              availableSources: Array.from(
                new Set([...existing.availableSources, ...item.availableSources])
              ),
            });
          } else {
            next.set(item.id, item);
          }
        }
        return next;
      });
      if (onMergeLiveSeries) {
        onMergeLiveSeries(incoming);
      }
    },
    [onMergeLiveSeries]
  );

  // Also absorb any live series that App.tsx hydrated into catalog
  useEffect(() => {
    const liveFromCatalog = catalog.filter(isLiveScrapedSeries);
    if (liveFromCatalog.length > 0) {
      setLiveSeriesMap((prev) => {
        let changed = false;
        const next = new Map(prev);
        for (const item of liveFromCatalog) {
          if (!next.has(item.id)) {
            next.set(item.id, item);
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }
  }, [catalog]);

  const fetchLiveBrowseData = useCallback(
    async (opts: {
      sourceId: SourceId | 'ALL';
      query: string;
      sortBy: BrowseSortOption;
      status: BrowseStatusFilter;
      format: BrowseFormatFilter;
      demographic: BrowseDemographicFilter;
      minChapters: number;
      page: number;
      forceRefresh?: boolean;
      signal?: AbortSignal;
    }) => {
      setIsLoadingLive(true);
      try {
        const params = new URLSearchParams({
          sourceId: opts.sourceId,
          q: opts.query.trim(),
          sortBy: opts.sortBy,
          status: opts.status,
          format: opts.format,
          demographic: opts.demographic,
          minChapters: String(opts.minChapters),
          page: String(opts.page),
        });
        if (opts.forceRefresh) {
          params.set('refresh', '1');
        }

        const res = await fetch(`/api/manga/browse?${params.toString()}`, {
          signal: opts.signal,
        });
        if (!res.ok) return;
        const data = (await res.json()) as {
          ok?: boolean;
          results?: MangaSeries[];
          sourcesQueried?: SourceId[];
        };
        if (Array.isArray(data.results) && data.results.length > 0) {
          const taggedResults =
            opts.sourceId !== 'ALL'
              ? data.results.map((item) =>
                  item.availableSources.includes(opts.sourceId)
                    ? item
                    : {
                        ...item,
                        availableSources: [opts.sourceId, ...item.availableSources],
                      }
                )
              : data.results;
          mergeIncomingSeries(taggedResults);
          const srcLabel =
            opts.sourceId === 'ALL'
              ? `All ${ALL_FMD2_SOURCES.length} Live Sources`
              : ALL_FMD2_SOURCES.find((s) => s.id === opts.sourceId)?.domain || opts.sourceId;
          setLastSyncedLabel(
            `Synced ${data.results.length} live series from ${srcLabel} (Page ${opts.page})`
          );
        }
      } catch {
        // Ignore abort errors
      } finally {
        if (!opts.signal?.aborted) {
          setIsLoadingLive(false);
        }
      }
    },
    [mergeIncomingSeries]
  );

  // Trigger live upstream fetch when source, sort, status, format, demographic, or search query changes
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(
      () => {
        const currentPage = livePageBySource[filters.sourceId] || 1;
        void fetchLiveBrowseData({
          sourceId: filters.sourceId,
          query: filters.searchQuery,
          sortBy: filters.sortBy,
          status: filters.status,
          format: filters.format,
          demographic: filters.demographic,
          minChapters: filters.minChapters,
          page: currentPage,
          signal: controller.signal,
        });
      },
      filters.searchQuery.trim() ? 260 : 10
    );

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [
    filters.sourceId,
    filters.searchQuery,
    filters.sortBy,
    filters.status,
    filters.format,
    filters.demographic,
    filters.minChapters,
    livePageBySource,
    fetchLiveBrowseData,
  ]);

  // Use 100% live upstream data once fetched (only falling back if initial fetch hasn't resolved yet)
  const activePool = useMemo<MangaSeries[]>(() => {
    const liveList = Array.from(liveSeriesMap.values());
    if (liveList.length > 0) {
      return liveList;
    }
    return catalog;
  }, [liveSeriesMap, catalog]);

  const displayedGenres = useMemo(
    () => (showAllGenres ? CANONICAL_BROWSE_GENRES : CANONICAL_BROWSE_GENRES.slice(0, 14)),
    [showAllGenres]
  );

  const headerFilterOptions = useMemo(
    () =>
      computeBrowseHeaderFilterOptions(activePool, filters.sourceId, CANONICAL_BROWSE_GENRES),
    [activePool, filters.sourceId]
  );

  const selectedHeaderGenreValue =
    filters.includedGenres.length === 0
      ? 'All'
      : filters.includedGenres.length === 1
      ? filters.includedGenres[0]
      : '__MULTIPLE__';

  const normalizedSortValue = normalizeBrowseSortOption(filters.sortBy);

  const genreDropdownItems = useMemo<DropdownMenuItem<string>[]>(() => {
    const items: DropdownMenuItem<string>[] = [
      {
        value: 'All',
        label: 'All Genres',
        description: 'Show all genres across active sources',
        badge: headerFilterOptions.statusCounts.All,
      },
    ];
    if (selectedHeaderGenreValue === '__MULTIPLE__') {
      items.push({
        value: '__MULTIPLE__',
        label: `Multiple Genres`,
        description: filters.includedGenres.join(', '),
        badge: filters.includedGenres.length,
      });
    }
    for (const g of headerFilterOptions.genres) {
      items.push({
        value: g.name,
        label: g.name,
        badge: g.count,
      });
    }
    return items;
  }, [headerFilterOptions, selectedHeaderGenreValue, filters.includedGenres]);

  const statusDropdownItems = useMemo<DropdownMenuItem<BrowseStatusFilter>[]>(
    () => [
      {
        value: 'All',
        label: 'All Statuses',
        description: 'Ongoing, completed, and hiatus series',
        badge: headerFilterOptions.statusCounts.All,
      },
      {
        value: 'Ongoing',
        label: 'Ongoing',
        description: 'Actively serializing chapters',
        badge: headerFilterOptions.statusCounts.Ongoing,
        accentDotColor: 'bg-emerald-400',
      },
      {
        value: 'Completed',
        label: 'Completed',
        description: 'Finished publication run',
        badge: headerFilterOptions.statusCounts.Completed,
        accentDotColor: 'bg-indigo-400',
      },
      {
        value: 'Hiatus',
        label: 'Hiatus',
        description: 'Temporarily paused serialization',
        badge: headerFilterOptions.statusCounts.Hiatus,
        accentDotColor: 'bg-amber-400',
      },
    ],
    [headerFilterOptions.statusCounts]
  );

  const sortDropdownItems = useMemo<DropdownMenuItem<BrowseSortOption>[]>(
    () =>
      BROWSE_SORT_MENU_OPTIONS.map((opt) => ({
        value: opt.id,
        label: opt.label,
        description: opt.description,
      })),
    []
  );

  const sourceDropdownItems = useMemo<DropdownMenuItem<string>[]>(
    () => [
      {
        value: 'ALL',
        label: 'All Sources',
        description: `${ALL_FMD2_SOURCES.length} verified FMD2 Lua connectors`,
        badge: activePool.length,
      },
      ...ALL_FMD2_SOURCES.map((src) => ({
        value: src.id,
        label: src.name,
        description: `${src.domain} · ${src.category}`,
        accentDotColor: enabledSources.includes(src.id)
          ? 'bg-emerald-400'
          : 'bg-slate-600',
      })),
    ],
    [activePool.length, enabledSources]
  );

  const formatDropdownItems = useMemo<DropdownMenuItem<BrowseFormatFilter>[]>(
    () =>
      FORMAT_OPTIONS.map((fmt) => ({
        value: fmt,
        label: fmt === 'All' ? 'All Formats' : fmt,
        description:
          fmt === 'All'
            ? 'Manga, Manhwa, Manhua & Webtoons'
            : `Filter to ${fmt} releases`,
      })),
    []
  );

  const demographicDropdownItems = useMemo<DropdownMenuItem<BrowseDemographicFilter>[]>(
    () =>
      DEMOGRAPHIC_OPTIONS.map((demo) => ({
        value: demo,
        label: demo === 'All' ? 'All Demographics' : demo,
      })),
    []
  );

  const minChapterDropdownItems = useMemo<DropdownMenuItem<string>[]>(
    () =>
      MIN_CHAPTER_PRESETS.map((preset) => ({
        value: String(preset.value),
        label: preset.label,
      })),
    []
  );

  // Compute series count per FMD2 source connector for enabled & searched sources
  const sourceSeriesCounts = useMemo(() => {
    const counts = new Map<SourceId, number>();
    const enabledSet = new Set(enabledSources);
    for (const src of ALL_FMD2_SOURCES) {
      if (!enabledSet.has(src.id) && !src.enabledByDefault) continue;
      let count = 0;
      for (const s of activePool) {
        if (seriesSupportsSource(s, src.id)) count++;
      }
      counts.set(src.id, count);
    }
    return counts;
  }, [activePool, enabledSources]);

  // Filter the left-rail source connectors directory
  const filteredSourcesList = useMemo(() => {
    const q = sourceSearch.trim().toLowerCase();
    const enabledSet = new Set(enabledSources);
    return ALL_FMD2_SOURCES.filter((src) => {
      if (showEnabledSourcesOnly && !enabledSet.has(src.id)) return false;
      if (!q) return true;
      return (
        src.name.toLowerCase().includes(q) ||
        src.domain.toLowerCase().includes(q) ||
        src.category.toLowerCase().includes(q) ||
        src.language.toLowerCase().includes(q)
      );
    }).sort((a, b) => {
      const aEn = enabledSet.has(a.id) ? 0 : 1;
      const bEn = enabledSet.has(b.id) ? 0 : 1;
      if (aEn !== bEn) return aEn - bEn;
      return (sourceSeriesCounts.get(b.id) || 0) - (sourceSeriesCounts.get(a.id) || 0);
    });
  }, [sourceSearch, showEnabledSourcesOnly, enabledSources, sourceSeriesCounts]);

  const displayedSidebarSources = useMemo(
    () =>
      sourceSearch.trim().length > 0
        ? filteredSourcesList.slice(0, 60)
        : filteredSourcesList.slice(0, visibleSourcesLimit),
    [filteredSourcesList, sourceSearch, visibleSourcesLimit]
  );

  // Filtered and sorted manga/manhwa catalog for the selected source and filters
  const filteredCatalog = useMemo(
    () => filterAndSortSourceBrowserCatalog(activePool, filters),
    [activePool, filters]
  );

  const selectedSourceMeta = useMemo(
    () =>
      filters.sourceId === 'ALL'
        ? null
        : ALL_FMD2_SOURCES.find((s) => s.id === filters.sourceId) || null,
    [filters.sourceId]
  );

  const hasActiveFilters =
    filters.searchQuery.trim() !== '' ||
    filters.format !== 'All' ||
    filters.demographic !== 'All' ||
    filters.status !== 'All' ||
    filters.includedGenres.length > 0 ||
    filters.excludedGenres.length > 0 ||
    filters.minChapters > 0 ||
    filters.minYear > 1985 ||
    filters.maxYear < 2026 ||
    filters.sortBy !== 'popular';

  const handleResetFilters = () => {
    setFilters((prev) => ({
      ...DEFAULT_SOURCE_BROWSE_FILTERS,
      sourceId: prev.sourceId,
    }));
  };

  const handleGenreToggle = (genre: string) => {
    const next = cycleTriStateGenreFilter(
      genre,
      filters.includedGenres,
      filters.excludedGenres
    );
    setFilters((prev) => ({
      ...prev,
      includedGenres: next.includedGenres,
      excludedGenres: next.excludedGenres,
    }));
  };

  const handleRefreshLiveFeed = () => {
    const currentPage = livePageBySource[filters.sourceId] || 1;
    void fetchLiveBrowseData({
      sourceId: filters.sourceId,
      query: filters.searchQuery,
      sortBy: filters.sortBy,
      status: filters.status,
      format: filters.format,
      demographic: filters.demographic,
      minChapters: filters.minChapters,
      page: currentPage,
      forceRefresh: true,
    });
  };

  const handleLoadNextPage = () => {
    const nextPage = (livePageBySource[filters.sourceId] || 1) + 1;
    setLivePageBySource((prev) => ({
      ...prev,
      [filters.sourceId]: nextPage,
    }));
  };

  const currentSourcePage = livePageBySource[filters.sourceId] || 1;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start animate-view-enter">
      {/* LEFT RAIL: Verified Live FMD2 Source Connectors Directory */}
      <aside className="lg:col-span-3 bg-[#0F1523] border border-slate-800 rounded-xl p-4 space-y-3.5 lg:sticky lg:top-20">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-[11px] font-mono uppercase tracking-wider text-indigo-400">
              LIVE FMD2 CONNECTORS
            </div>
            <h2 className="text-base font-bold text-white font-display">
              Source Directory ({ALL_FMD2_SOURCES.length})
            </h2>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={showEnabledSourcesOnly}
            aria-label="Toggle enabled sources only"
            onClick={() => setShowEnabledSourcesOnly((v) => !v)}
            className="inline-flex items-center gap-2 text-[11px] font-medium text-slate-300 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <span>Enabled Only</span>
            <span
              aria-hidden="true"
              className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors ${
                showEnabledSourcesOnly ? 'bg-indigo-600' : 'bg-slate-700'
              }`}
            >
              <span
                className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                  showEnabledSourcesOnly ? 'translate-x-3.5' : 'translate-x-0.5'
                }`}
              />
            </span>
          </button>
        </div>

        {/* Source Search Input */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            aria-label="Filter FMD2 sources by name or domain"
            value={sourceSearch}
            onChange={(e) => setSourceSearch(e.target.value)}
            placeholder="Search live source or domain..."
            className="w-full pl-8 pr-3 py-2 text-xs bg-[#0B0F17] border border-slate-800 rounded-lg text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>

        {/* All Sources Combined Option */}
        <button
          type="button"
          data-source-id="ALL"
          onClick={() => setFilters((prev) => ({ ...prev, sourceId: 'ALL' }))}
          className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border text-left transition-colors ${
            filters.sourceId === 'ALL'
              ? 'bg-indigo-600/15 border-indigo-500 text-white'
              : 'bg-[#0B0F17]/70 border-slate-800/90 text-slate-300 hover:border-slate-700 hover:text-white'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <Globe className="w-4 h-4 text-indigo-400 shrink-0" />
            <div className="truncate">
              <div className="text-xs font-semibold truncate">All Live Sources</div>
              <div className="text-[11px] font-mono text-slate-400 truncate">
                {ALL_FMD2_SOURCES.length} Verified Live Connectors
              </div>
            </div>
          </div>
          <span className="text-xs font-mono tabular-nums text-indigo-300 shrink-0">
            {activePool.length}
          </span>
        </button>

        {/* Scrollable Verified Source List */}
        <div className="space-y-1.5 max-h-[520px] overflow-y-auto pr-1">
          {displayedSidebarSources.map((src) => {
            const isSelected = filters.sourceId === src.id;
            const isEnabled = enabledSources.includes(src.id);
            const count = sourceSeriesCounts.get(src.id);

            return (
              <div
                key={src.id}
                data-source-id={src.id}
                onClick={() => setFilters((prev) => ({ ...prev, sourceId: src.id }))}
                role="button"
                tabIndex={0}
                aria-label={`Select source ${src.name}`}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setFilters((prev) => ({ ...prev, sourceId: src.id }));
                  }
                }}
                className={`group flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors ${
                  isSelected
                    ? 'bg-indigo-600/15 border-indigo-500 text-white'
                    : 'bg-[#0B0F17]/60 border-slate-800/80 text-slate-300 hover:border-slate-700 hover:text-white'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        isEnabled ? 'bg-emerald-400' : 'bg-slate-600'
                      }`}
                    />
                    <span className="text-xs font-semibold truncate">{src.name}</span>
                    <span className="text-[10px] font-mono text-slate-500 uppercase shrink-0">
                      {src.language}
                    </span>
                  </div>
                  <div className="text-[11px] font-mono text-slate-400 truncate mt-0.5">
                    {src.domain} · {src.category}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {typeof count === 'number' && (
                    <span className="text-xs font-mono tabular-nums text-slate-400">
                      {count}
                    </span>
                  )}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isEnabled}
                    aria-label={`Toggle ${src.name} connector`}
                    title={
                      isEnabled
                        ? `${src.name} is enabled in FMD2 Engine`
                        : `Enable ${src.name} connector`
                    }
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleEnableSource(src.id);
                    }}
                    className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors cursor-pointer ${
                      isEnabled ? 'bg-emerald-500' : 'bg-slate-700 hover:bg-slate-600'
                    }`}
                  >
                    <span
                      className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                        isEnabled ? 'translate-x-3.5' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>
              </div>
            );
          })}

          {filteredSourcesList.length > displayedSidebarSources.length && (
            <button
              type="button"
              onClick={() => setVisibleSourcesLimit((prev) => prev + 50)}
              className="w-full py-2 px-3 text-xs font-mono text-indigo-400 hover:text-white bg-[#0B0F17] border border-slate-800 rounded-lg transition-colors text-center cursor-pointer"
            >
              Show More Connectors (+{filteredSourcesList.length - displayedSidebarSources.length})
            </button>
          )}
        </div>
      </aside>

      {/* RIGHT WORKSPACE: Source Header, Dropdown Filter Deck & Live Catalog Grid */}
      <div className="lg:col-span-9 space-y-4 min-w-0">
        {/* Selected Source Banner & Filter Deck */}
        <section className="relative z-30 bg-[#0F1523] border border-slate-800/80 rounded-xl p-4 sm:p-5 space-y-3.5">
          {/* Header Block: Source Title & Quick Actions + Genre / Status / Sort by Dropdown Toolbar */}
          <div className="border-b border-slate-800/80 pb-3.5 space-y-3">
            {/* Top Row: Source Title, Lua Module & Sync Status + Quick Utility Buttons */}
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
              <div className="space-y-1 min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-mono text-indigo-400">
                  <span className="break-all sm:break-normal">
                    {selectedSourceMeta
                      ? `${selectedSourceMeta.luaModule.toUpperCase()} · ${selectedSourceMeta.domain.toUpperCase()}`
                      : `ALL VERIFIED FMD2 SOURCES`}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="text-emerald-400">{lastSyncedLabel}</span>
                </div>
                <h1 className="text-xl sm:text-2xl font-bold text-white font-display tracking-tight">
                  {selectedSourceMeta
                    ? `Browse ${selectedSourceMeta.name}`
                    : 'Browse Live Manga & Manhwa Sources'}
                </h1>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {selectedSourceMeta && (
                  <button
                    type="button"
                    role="switch"
                    aria-checked={enabledSources.includes(selectedSourceMeta.id)}
                    onClick={() => onToggleEnableSource(selectedSourceMeta.id)}
                    className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg border bg-[#0B0F17] border-slate-800 text-slate-200 hover:border-indigo-500/60 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <span>Source Active</span>
                    <span
                      aria-hidden="true"
                      className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors ${
                        enabledSources.includes(selectedSourceMeta.id)
                          ? 'bg-emerald-500'
                          : 'bg-slate-700'
                      }`}
                    >
                      <span
                        className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                          enabledSources.includes(selectedSourceMeta.id)
                            ? 'translate-x-3.5'
                            : 'translate-x-0.5'
                        }`}
                      />
                    </span>
                  </button>
                )}

                {onOpenCloudSync && (
                  <button
                    type="button"
                    onClick={onOpenCloudSync}
                    aria-label="Open Cloud Reading History Sync"
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border bg-[#0B0F17] border-slate-800 text-slate-300 hover:border-indigo-500 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Cloud
                      className={`w-3.5 h-3.5 ${
                        cloudSyncStatus === 'syncing'
                          ? 'text-indigo-400 animate-pulse'
                          : cloudSyncStatus === 'synced'
                          ? 'text-emerald-400'
                          : 'text-amber-400'
                      }`}
                    />
                    <span>Cloud Sync</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleRefreshLiveFeed}
                  disabled={isLoadingLive}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border bg-[#0B0F17] border-slate-700 text-slate-200 hover:border-indigo-500 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 text-indigo-400 ${
                      isLoadingLive ? 'animate-spin' : ''
                    }`}
                  />
                  <span>{isLoadingLive ? 'Fetching...' : 'Refresh'}</span>
                </button>

                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={handleResetFilters}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reset</span>
                  </button>
                )}
              </div>
            </div>

            {/* Header Filter & Sort Dropdown Menu Bar (Genre, Status, Sort by) */}
            <div className="flex flex-wrap items-center gap-2.5">
              {/* 1. Header Genre Filter Dropdown Menu UI */}
              <DropdownMenu<string>
                id="browse-header-genre-select"
                label="Genre"
                ariaLabel="Filter catalog by genre"
                value={selectedHeaderGenreValue}
                options={genreDropdownItems}
                searchable
                searchPlaceholder="Search genre..."
                menuWidthClass="w-64"
                onChange={(val) => {
                  if (val === '__MULTIPLE__') return;
                  setFilters((prev) => applyBrowseHeaderGenreFilter(prev, val));
                }}
              />

              {/* 2. Header Manga Status Filter Dropdown Menu UI */}
              <DropdownMenu<BrowseStatusFilter>
                id="browse-header-status-select"
                label="Status"
                ariaLabel="Filter catalog by manga status"
                value={filters.status}
                options={statusDropdownItems}
                menuWidthClass="w-60"
                onChange={(val) =>
                  setFilters((prev) => applyBrowseHeaderStatusFilter(prev, val))
                }
              />

              {/* 3. Header 'Sort by' Dropdown Menu UI ('Popularity', 'Newest', 'Alphabetical', 'Rating') */}
              <DropdownMenu<BrowseSortOption>
                id="browse-header-sort-select"
                label="Sort by"
                ariaLabel="Sort catalog by"
                icon={<ArrowUpDown className="w-3.5 h-3.5" />}
                value={normalizedSortValue}
                options={sortDropdownItems}
                align="left"
                menuWidthClass="w-64"
                onChange={(val) =>
                  setFilters((prev) => applyBrowseHeaderSortBy(prev, val))
                }
              />
            </div>
          </div>

          {/* Search & Secondary Custom Dropdown Filter Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-12 gap-2.5 items-center">
            {/* Search Input */}
            <div className="sm:col-span-2 xl:col-span-4 relative min-w-0">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                aria-label="Search titles within selected source"
                value={filters.searchQuery}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, searchQuery: e.target.value }))
                }
                placeholder={
                  selectedSourceMeta
                    ? `Search live ${selectedSourceMeta.name} catalog...`
                    : 'Search live sources by title, author, or tag...'
                }
                className="w-full pl-10 pr-3 py-1.5 text-xs bg-[#0B0F17] border border-slate-800 rounded-lg text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>

            {/* Source Connector Custom Dropdown UI */}
            <div className="xl:col-span-2 min-w-0">
              <DropdownMenu<string>
                label="Source"
                ariaLabel="Select source connector"
                icon={<Globe className="w-3.5 h-3.5" />}
                value={filters.sourceId}
                options={sourceDropdownItems}
                searchable
                searchPlaceholder="Find connector..."
                menuWidthClass="w-72"
                className="w-full"
                onChange={(val) =>
                  setFilters((prev) => ({
                    ...prev,
                    sourceId: val as SourceId | 'ALL',
                  }))
                }
              />
            </div>

            {/* Format Custom Dropdown UI */}
            <div className="xl:col-span-2 min-w-0">
              <DropdownMenu<BrowseFormatFilter>
                label="Format"
                ariaLabel="Filter by format"
                value={filters.format}
                options={formatDropdownItems}
                menuWidthClass="w-60"
                className="w-full"
                onChange={(val) =>
                  setFilters((prev) => ({
                    ...prev,
                    format: val,
                  }))
                }
              />
            </div>

            {/* Demographic Custom Dropdown UI */}
            <div className="xl:col-span-2 min-w-0">
              <DropdownMenu<BrowseDemographicFilter>
                label="Demo"
                ariaLabel="Filter by demographic"
                value={filters.demographic}
                options={demographicDropdownItems}
                menuWidthClass="w-56"
                className="w-full"
                onChange={(val) =>
                  setFilters((prev) => ({
                    ...prev,
                    demographic: val,
                  }))
                }
              />
            </div>

            {/* Minimum Chapters Custom Dropdown UI */}
            <div className="xl:col-span-2 min-w-0">
              <DropdownMenu<string>
                label="Chapters"
                ariaLabel="Filter by minimum chapters"
                value={String(filters.minChapters)}
                options={minChapterDropdownItems}
                align="right"
                menuWidthClass="w-52"
                className="w-full"
                onChange={(val) =>
                  setFilters((prev) => ({
                    ...prev,
                    minChapters: Number(val),
                  }))
                }
              />
            </div>
          </div>

          {/* Secondary Compact Row: Active Filter Summary & Multi-Genre / Year Filter Toggle */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1">
            <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-slate-400">
              <span>
                Showing <strong className="text-white">{filteredCatalog.length}</strong> series
              </span>
              <span aria-hidden="true">·</span>
              <span>
                Sorted by{' '}
                <strong className="text-indigo-300">
                  {BROWSE_SORT_MENU_OPTIONS.find((o) => o.id === normalizedSortValue)?.label ||
                    'Popularity'}
                </strong>
              </span>
              {filters.status !== 'All' && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-emerald-300">Status: {filters.status}</span>
                </>
              )}
              {filters.includedGenres.length > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-indigo-300">
                    Genre: {filters.includedGenres.join(', ')}
                  </span>
                </>
              )}
            </div>

            {/* Genres Dropdown Drawer Trigger */}
            <button
              type="button"
              aria-expanded={showAdvancedFilters}
              onClick={() => setShowAdvancedFilters((v) => !v)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap cursor-pointer ${
                showAdvancedFilters ||
                filters.includedGenres.length > 0 ||
                filters.excludedGenres.length > 0
                  ? 'bg-indigo-600/20 border-indigo-500/60 text-indigo-300'
                  : 'bg-[#0B0F17] border-slate-800 text-slate-300 hover:text-white'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>
                Advanced Multi-Genre &amp; Year Filter
                {filters.includedGenres.length + filters.excludedGenres.length > 0
                  ? ` (${filters.includedGenres.length + filters.excludedGenres.length})`
                  : ''}
              </span>
              {showAdvancedFilters ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>
          </div>

          {/* Collapsible Genre & Year Popover Panel */}
          {(showAdvancedFilters ||
            filters.includedGenres.length > 0 ||
            filters.excludedGenres.length > 0) && (
            <div className="space-y-3 pt-3 border-t border-slate-800/80">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-[11px] font-mono text-slate-400">
                  <span>Tri-State Genres (1st Click: +Include · 2nd Click: −Exclude)</span>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  {/* Year Range */}
                  <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-400">
                    <span>Release Years:</span>
                    <input
                      type="number"
                      aria-label="Minimum release year"
                      min={1980}
                      max={2026}
                      value={filters.minYear}
                      onChange={(e) =>
                        setFilters((prev) => ({
                          ...prev,
                          minYear: Math.min(Number(e.target.value) || 1985, prev.maxYear),
                        }))
                      }
                      className="w-14 bg-[#0B0F17] border border-slate-800 rounded px-1.5 py-0.5 text-[11px] font-mono text-white text-center tabular-nums"
                    />
                    <span>–</span>
                    <input
                      type="number"
                      aria-label="Maximum release year"
                      min={1980}
                      max={2026}
                      value={filters.maxYear}
                      onChange={(e) =>
                        setFilters((prev) => ({
                          ...prev,
                          maxYear: Math.max(Number(e.target.value) || 2026, prev.minYear),
                        }))
                      }
                      className="w-14 bg-[#0B0F17] border border-slate-800 rounded px-1.5 py-0.5 text-[11px] font-mono text-white text-center tabular-nums"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowAllGenres((v) => !v)}
                    className="flex items-center gap-1 text-[11px] font-mono text-indigo-400 hover:text-indigo-300 cursor-pointer"
                  >
                    <span>
                      {showAllGenres
                        ? 'Fewer Genres'
                        : `All Genres (${CANONICAL_BROWSE_GENRES.length})`}
                    </span>
                    {showAllGenres ? (
                      <ChevronUp className="w-3 h-3" />
                    ) : (
                      <ChevronDown className="w-3 h-3" />
                    )}
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {displayedGenres.map((genre) => {
                  const isIncluded = filters.includedGenres.includes(genre);
                  const isExcluded = filters.excludedGenres.includes(genre);

                  return (
                    <button
                      key={genre}
                      type="button"
                      onClick={() => handleGenreToggle(genre)}
                      className={`flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        isIncluded
                          ? 'bg-emerald-500/15 border-emerald-500/60 text-emerald-300'
                          : isExcluded
                          ? 'bg-rose-500/15 border-rose-500/60 text-rose-300 line-through'
                          : 'bg-[#0B0F17] border-slate-800 text-slate-300 hover:border-slate-700 hover:text-white'
                      }`}
                    >
                      {isIncluded && <Plus className="w-2.5 h-2.5 text-emerald-400" />}
                      {isExcluded && <Minus className="w-2.5 h-2.5 text-rose-400" />}
                      <span>{genre}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        {/* Continue Reading Strip on Main Browse Home Page */}
        {recentlyReadEntries.length > 0 && onResumeSeries && (
          <section
            aria-label="Continue Reading Sessions"
            className="bg-[#0F1523] border border-slate-800 rounded-xl p-4 space-y-3"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-amber-400" />
                <h2 className="text-sm font-bold text-white font-display">
                  Continue Reading
                </h2>
              </div>
              {onClearAllReadingProgress && (
                <button
                  type="button"
                  onClick={onClearAllReadingProgress}
                  className="text-xs text-slate-400 hover:text-rose-300 transition-colors cursor-pointer"
                >
                  Clear History
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {recentlyReadEntries.slice(0, 3).map(({ series, progress }) => {
                const pct = Math.min(
                  100,
                  Math.max(
                    5,
                    Math.round((progress.lastPage / Math.max(1, progress.totalPages)) * 100)
                  )
                );
                return (
                  <article
                    key={`browse-recent-${series.id}`}
                    className="bg-[#0B0F17] border border-slate-800 hover:border-slate-700 rounded-xl p-3 flex items-center gap-3 transition-colors"
                  >
                    <div
                      onClick={() => onResumeSeries(series, progress)}
                      className="w-12 aspect-[3/4] rounded-lg overflow-hidden border border-slate-800 shrink-0 cursor-pointer"
                    >
                      <MangaCoverArt series={series} className="w-full h-full" />
                    </div>
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-start justify-between gap-1">
                        <h3 className="text-xs font-bold text-white truncate font-display">
                          {series.title}
                        </h3>
                        {onClearReadingProgress && (
                          <button
                            type="button"
                            onClick={() => onClearReadingProgress(series.id)}
                            aria-label={`Remove ${series.title} from reading history`}
                            className="text-slate-500 hover:text-rose-400 p-0.5 cursor-pointer"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                      <div className="text-[11px] font-mono text-amber-400 tabular-nums">
                        Ch. {progress.chapterNumber} · Page {progress.lastPage}/{progress.totalPages}
                      </div>
                      <div className="w-full h-1 bg-slate-900 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-amber-500 rounded-full"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onResumeSeries(series, progress)}
                      className="px-2.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-lg transition-colors shrink-0 cursor-pointer"
                    >
                      Resume
                    </button>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {/* Active Filter Status Strip */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <span className="font-mono text-white font-semibold tabular-nums">
              Showing {filteredCatalog.length} of {activePool.length} Live Series
            </span>
            {selectedSourceMeta && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-mono text-indigo-400">
                  Source: {selectedSourceMeta.name} ({selectedSourceMeta.domain})
                </span>
              </>
            )}
            {filters.format !== 'All' && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-mono text-slate-200">Format: {filters.format}</span>
              </>
            )}
            {filters.demographic !== 'All' && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-mono text-slate-200">
                  Demographic: {filters.demographic}
                </span>
              </>
            )}
            {filters.status !== 'All' && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-mono text-slate-200">Status: {filters.status}</span>
              </>
            )}
            {filters.includedGenres.length > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-mono text-emerald-400">
                  +Include: {filters.includedGenres.join(', ')}
                </span>
              </>
            )}
            {filters.excludedGenres.length > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-mono text-rose-400">
                  −Exclude: {filters.excludedGenres.join(', ')}
                </span>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={handleLoadNextPage}
            disabled={isLoadingLive}
            className="flex items-center gap-1.5 text-xs font-mono text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            <span>
              {isLoadingLive
                ? 'Loading live page...'
                : `Load More Live Series (Page ${currentSourcePage + 1})`}
            </span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Filtered Catalog Grid */}
        {isLoadingLive && filteredCatalog.length === 0 ? (
          <div className="bg-[#0F1523] border border-slate-800 rounded-xl p-12 text-center space-y-3">
            <RefreshCw className="w-6 h-6 text-indigo-400 animate-spin mx-auto" />
            <div className="text-lg font-bold text-white font-display">
              Fetching Live Catalog from{' '}
              {selectedSourceMeta ? selectedSourceMeta.name : 'Verified FMD2 Sources'}...
            </div>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Querying live upstream connectors for real series metadata, covers, genres, and chapter lists.
            </p>
          </div>
        ) : filteredCatalog.length === 0 ? (
          <div className="bg-[#0F1523] border border-slate-800 rounded-xl p-12 text-center space-y-4">
            <div className="text-lg font-bold text-white font-display">
              No Series Match Your Active Source & Filter Criteria
            </div>
            <p className="text-xs sm:text-sm text-slate-400 max-w-md mx-auto">
              Try clearing excluded genres, lowering the minimum chapter threshold, or refreshing the live source feed.
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={handleResetFilters}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Browse Filters</span>
              </button>
              <button
                type="button"
                onClick={handleRefreshLiveFeed}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Fetch Live From Upstream</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredCatalog.slice(0, visibleCardsLimit).map((series) => {
                const effectiveSourceId: SourceId =
                  filters.sourceId !== 'ALL' ? filters.sourceId : series.primarySource;
                const sourceMeta =
                  ALL_FMD2_SOURCES.find((s) => s.id === effectiveSourceId) ||
                  ALL_FMD2_SOURCES[0];
                const contentFormat = getSeriesContentFormat(series);
                const modeRes = resolveSeriesReadingMode(series, engineConfig);
                const progress = getSeriesReadingProgress(readingHistory, series);

                const seriesWithSource: MangaSeries = {
                  ...series,
                  primarySource: effectiveSourceId,
                  availableSources: series.availableSources.includes(effectiveSourceId)
                    ? series.availableSources
                    : [effectiveSourceId, ...series.availableSources],
                };

                return (
                  <article
                    key={series.id}
                    className="manga-card-interactive animate-card-enter bg-[#0F1523] border border-slate-800 hover:border-slate-700 rounded-xl overflow-hidden flex flex-col justify-between transition-colors"
                  >
                    <div className="p-4 flex gap-3.5">
                      {/* 3:4 Cover Art -> Opens Main Manga Page */}
                      <div
                        onClick={() => onInspectSeries(seriesWithSource)}
                        className="w-24 sm:w-28 aspect-[3/4] rounded-lg overflow-hidden border border-slate-800 shrink-0 cursor-pointer"
                      >
                        <div className="w-full h-full manga-cover-zoom">
                          <MangaCoverArt series={series} className="w-full h-full" />
                        </div>
                      </div>

                      {/* Unboxed Metadata Hierarchy */}
                      <div className="flex-1 min-w-0 flex flex-col justify-between">
                        <div className="space-y-1">
                          <div className="text-[11px] font-mono text-indigo-400 truncate">
                            {sourceMeta.name.toUpperCase()} · {contentFormat.toUpperCase()}
                          </div>

                          <h3 className="text-base font-bold text-white font-display line-clamp-2">
                            <button
                              type="button"
                              onClick={() => onInspectSeries(seriesWithSource)}
                              className="text-left hover:text-indigo-300 transition-colors cursor-pointer"
                            >
                              {series.title}
                            </button>
                          </h3>

                          {/* Unboxed Dot-Separated Metadata Line */}
                          <div className="text-xs text-slate-400 flex flex-wrap items-center gap-1.5">
                            <span>{series.demographic}</span>
                            <span aria-hidden="true">·</span>
                            <span>{series.status}</span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono tabular-nums">{series.year}</span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono tabular-nums text-amber-400 inline-flex items-center gap-1">
                              <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                              {series.rating.toFixed(1)}
                            </span>
                          </div>

                          <div className="text-xs font-mono text-slate-300 tabular-nums truncate">
                            {series.totalChapters} Chapters · {series.author}
                          </div>

                          {progress ? (
                            <div className="text-[11px] font-mono text-amber-400 flex items-center gap-1.5 pt-0.5 truncate">
                              <History className="w-3 h-3 shrink-0" />
                              <span className="truncate">
                                Last read: Ch. {progress.chapterNumber} (P. {progress.lastPage}/
                                {progress.totalPages}) · {formatRelativeReadTime(progress.updatedAt)} ·{' '}
                                <span className="text-emerald-400">
                                  Sync Time:{' '}
                                  {formatReadingSyncTime(
                                    computeReadingSyncDurationMs(progress, readingHistory)
                                  )}
                                </span>
                              </span>
                            </div>
                          ) : (
                            <div className="text-[11px] text-slate-400 line-clamp-2 pt-0.5">
                              {series.genres.join(' · ')}
                            </div>
                          )}
                        </div>

                        <div className="pt-1.5 text-[11px] font-mono text-emerald-400 truncate">
                          {modeRes.mode === 'webtoon'
                            ? 'Auto: Webtoon Long-Strip'
                            : 'Auto: Page-by-Page RTL'}
                        </div>
                      </div>
                    </div>

                    {/* Card Footer Actions */}
                    <div className="px-4 py-2.5 bg-[#0B0F17]/90 border-t border-slate-800/80 flex items-center justify-between gap-2">
                      {progress && onResumeSeries && (
                        <button
                          type="button"
                          onClick={() => onResumeSeries(series, progress)}
                          title={`Resume ${series.title} Chapter ${progress.chapterNumber} (Page ${progress.lastPage}/${progress.totalPages})`}
                          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <Play className="w-3.5 h-3.5 fill-slate-950" />
                          <span>Resume Ch. {progress.chapterNumber}</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onInspectSeries(seriesWithSource)}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                      >
                        <BookOpen className="w-3.5 h-3.5" />
                        <span>Manga Page ({series.totalChapters} Ch)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onReadSeriesOnSource(series, effectiveSourceId)}
                        className="flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg border border-slate-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <Play className="w-3 h-3" />
                        <span>Ch. 1</span>
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>

            {filteredCatalog.length > visibleCardsLimit && (
              <div className="flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => setVisibleCardsLimit((prev) => prev + 36)}
                  className="px-4 py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-white rounded-lg border border-slate-700 transition-colors cursor-pointer"
                >
                  Show More Filtered Results ({filteredCatalog.length - visibleCardsLimit} remaining)
                </button>
              </div>
            )}

            {/* Pagination / Load More Live Data Bar */}
            <div className="bg-[#0F1523] border border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="text-xs font-mono text-slate-400">
                Showing {filteredCatalog.length} live series · Upstream Page {currentSourcePage}
              </div>
              <button
                type="button"
                onClick={handleLoadNextPage}
                disabled={isLoadingLive}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white text-xs font-semibold rounded-lg transition-colors"
              >
                {isLoadingLive && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>
                  {isLoadingLive
                    ? 'Fetching Next Live Page...'
                    : `Load Page ${currentSourcePage + 1} from ${
                        selectedSourceMeta ? selectedSourceMeta.name : 'All Live Sources'
                      }`}
                </span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
