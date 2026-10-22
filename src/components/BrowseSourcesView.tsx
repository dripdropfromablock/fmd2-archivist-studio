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
  Save,
  Trash2,
} from 'lucide-react';
import {
  ALL_FMD2_SOURCES,
  DEFAULT_ENABLED_SOURCE_IDS,
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
  type LiveSourceBrowseOutcome,
} from '../utils/fmdLogic.ts';
import { MangaCoverArt } from './MangaArtRenderer.tsx';
import { DropdownMenu, type DropdownMenuItem } from './DropdownMenu.tsx';
import { useFilterPresetStore } from '../store/filterPresetStore.ts';

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
  const [selectedMicroTropes, setSelectedMicroTropes] = useState<string[]>([]);
  const [presetName, setPresetName] = useState('');
  const presets = useFilterPresetStore((state) => state.presets);
  const savePreset = useFilterPresetStore((state) => state.savePreset);
  const deletePreset = useFilterPresetStore((state) => state.deletePreset);

  useEffect(() => {
    if (externalSearchQuery && externalSearchQuery !== filters.searchQuery) {
      setFilters((prev) => ({ ...prev, searchQuery: externalSearchQuery }));
    }
  }, [externalSearchQuery]);

  useEffect(() => {
    setVisibleCardsLimit(30);
  }, [filters.sourceId, filters.searchQuery, filters.sortBy, filters.status, filters.format, selectedMicroTropes]);

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
  const [sourceOutcomes, setSourceOutcomes] = useState<LiveSourceBrowseOutcome[]>([]);
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
      if (
        opts.sourceId !== 'ALL' &&
        !DEFAULT_ENABLED_SOURCE_IDS.includes(opts.sourceId)
      ) {
        const sourceName = ALL_FMD2_SOURCES.find((source) => source.id === opts.sourceId)?.name;
        setLastSyncedLabel(
          `${sourceName || opts.sourceId} is catalogued, but has no live scraper yet`
        );
        setSourceOutcomes([
          {
            sourceId: opts.sourceId,
            outcome: 'unsupported',
            latencyMs: 0,
            resultCount: 0,
            cached: false,
            stale: false,
            message: 'This connector is catalogued but does not have a live scraper.',
          },
        ]);
        setIsLoadingLive(false);
        return;
      }

      setIsLoadingLive(true);
      setSourceOutcomes([]);
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
        const data = (await res.json()) as {
          ok?: boolean;
          error?: string;
          results?: MangaSeries[];
          sourcesQueried?: SourceId[];
          sourceOutcomes?: LiveSourceBrowseOutcome[];
        };
        if (opts.signal?.aborted) return;
        const outcomes = Array.isArray(data.sourceOutcomes) ? data.sourceOutcomes : [];
        setSourceOutcomes(outcomes);
        const failedOutcomes = outcomes.filter(
          (outcome) => !['success', 'empty'].includes(outcome.outcome)
        );
        const staleCount = outcomes.filter((outcome) => outcome.stale).length;
        if (!res.ok || data.ok === false) {
          setLastSyncedLabel(
            failedOutcomes.length > 0
              ? `${failedOutcomes.length} live source${failedOutcomes.length === 1 ? '' : 's'} unavailable`
              : data.error || 'Live source request failed'
          );
          return;
        }
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
              ? `All ${DEFAULT_ENABLED_SOURCE_IDS.length} Live Sources`
              : ALL_FMD2_SOURCES.find((s) => s.id === opts.sourceId)?.domain || opts.sourceId;
          const statusLabel = failedOutcomes.length
            ? ` · ${failedOutcomes.length} source${failedOutcomes.length === 1 ? '' : 's'} unavailable`
            : staleCount
            ? ` · showing cached data for ${staleCount} source${staleCount === 1 ? '' : 's'}`
            : '';
          setLastSyncedLabel(`Synced ${data.results.length} live series from ${srcLabel}${statusLabel}`);
        } else if (outcomes.length > 0 && outcomes.every((outcome) => outcome.outcome === 'empty')) {
          setLastSyncedLabel('No live series matched this query');
        } else if (failedOutcomes.length > 0) {
          setLastSyncedLabel(
            `${failedOutcomes.length} live source${failedOutcomes.length === 1 ? '' : 's'} unavailable`
          );
        }
      } catch {
        if (opts.signal?.aborted) return;
        const failedSources = opts.sourceId === 'ALL' ? DEFAULT_ENABLED_SOURCE_IDS : [opts.sourceId];
        const outcomes: LiveSourceBrowseOutcome[] = failedSources.map((sourceId) => ({
          sourceId,
          outcome: 'network_error',
          latencyMs: 0,
          resultCount: 0,
          cached: false,
          stale: false,
          message: 'Could not reach the local browse service.',
        }));
        setSourceOutcomes(outcomes);
        setLastSyncedLabel('Could not reach the live browse service');
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
        accentDotColor: 'bg-violet-300',
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
    () => {
      const filtered = filterAndSortSourceBrowserCatalog(activePool, filters);
      if (selectedMicroTropes.length === 0) return filtered;
      return filtered.filter((series) => {
        const tags = (series.metadataTags || []).map((tag) => tag.toLowerCase());
        return selectedMicroTropes.every((trope) => tags.includes(trope.toLowerCase()));
      });
    },
    [activePool, filters, selectedMicroTropes]
  );

  const availableMicroTropes = useMemo(() => {
    const tags = activePool.flatMap((series) => series.metadataTags || []);
    return [...new Set(tags.map((tag) => tag.trim()).filter((tag) => tag && !/18\+|nsfw|mature/i.test(tag)))].sort((a, b) => a.localeCompare(b)).slice(0, 18);
  }, [activePool]);

  const selectedSourceMeta = useMemo(
    () =>
      filters.sourceId === 'ALL'
        ? null
        : ALL_FMD2_SOURCES.find((s) => s.id === filters.sourceId) || null,
    [filters.sourceId]
  );

  const sourceOutcomesNeedingAttention = sourceOutcomes.filter(
    (outcome) =>
      (outcome.outcome !== 'unsupported' && !['success', 'empty'].includes(outcome.outcome)) ||
      outcome.stale
  );
  const hasSourceFailures = sourceOutcomes.some(
    (outcome) => outcome.outcome !== 'unsupported' && !['success', 'empty'].includes(outcome.outcome)
  );
  const hasUnsupportedSource = sourceOutcomes.some((outcome) => outcome.outcome === 'unsupported');
  const sourcesReturnedEmpty =
    sourceOutcomes.length > 0 && sourceOutcomes.every((outcome) => outcome.outcome === 'empty');

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
    filters.sortBy !== 'popular' ||
    selectedMicroTropes.length > 0;

  const handleResetFilters = () => {
    setFilters((prev) => ({
      ...DEFAULT_SOURCE_BROWSE_FILTERS,
      sourceId: prev.sourceId,
    }));
    setSelectedMicroTropes([]);
  };

  const handleSavePreset = () => {
    const name = presetName.trim();
    if (!name) return;
    savePreset(name, filters, selectedMicroTropes);
    setPresetName('');
  };

  const handleApplyPreset = (presetId: string) => {
    const preset = presets.find((item) => item.id === presetId);
    if (!preset) return;
    setFilters({ ...preset.filters });
    setSelectedMicroTropes([...(preset.microTropes || [])]);
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
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* LEFT RAIL: Verified Live FMD2 Source Connectors Directory */}
      <aside className="lg:col-span-3 bg-[#11121A] border border-white/[0.07] rounded-xl p-4 space-y-3.5 lg:sticky lg:top-20">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-[11px] font-mono uppercase tracking-wider text-violet-300">
              FMD2 CONNECTOR CATALOGUE
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
                showEnabledSourcesOnly ? 'bg-violet-500' : 'bg-slate-700'
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
            className="w-full pl-8 pr-3 py-2 text-xs bg-[#090A0F] border border-white/[0.07] rounded-lg text-white placeholder:text-slate-500 focus:outline-none focus:border-violet-300/25"
          />
        </div>

        {/* All Sources Combined Option */}
        <button
          type="button"
          data-source-id="ALL"
          onClick={() => setFilters((prev) => ({ ...prev, sourceId: 'ALL' }))}
          className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border text-left transition-colors ${
            filters.sourceId === 'ALL'
              ? 'bg-violet-500/12 border-violet-300/25 text-white'
              : 'bg-[#090A0F]/70 border-white/[0.07] text-slate-300 hover:border-white/[0.1] hover:text-white'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <Globe className="w-4 h-4 text-violet-300 shrink-0" />
            <div className="truncate">
              <div className="text-xs font-semibold truncate">All Live Sources</div>
              <div className="text-[11px] font-mono text-slate-400 truncate">
                {DEFAULT_ENABLED_SOURCE_IDS.length} Live Scrapers · {ALL_FMD2_SOURCES.length} Connector Descriptors
              </div>
            </div>
          </div>
          <span className="text-xs font-mono tabular-nums text-violet-200 shrink-0">
            {activePool.length}
          </span>
        </button>

        {/* Scrollable Verified Source List */}
        <div className="space-y-1.5 max-h-[520px] overflow-y-auto pr-1">
          {displayedSidebarSources.map((src) => {
            const isSelected = filters.sourceId === src.id;
            const isEnabled = enabledSources.includes(src.id);
            const hasLiveAdapter = DEFAULT_ENABLED_SOURCE_IDS.includes(src.id);
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
                    ? 'bg-violet-500/12 border-violet-300/25 text-white'
                    : 'bg-[#090A0F]/60 border-white/[0.06] text-slate-300 hover:border-white/[0.1] hover:text-white'
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
                    aria-disabled={!hasLiveAdapter}
                    title={
                      !hasLiveAdapter
                        ? `${src.name} is catalog metadata only; a live scraper is not implemented yet`
                        : isEnabled
                        ? `${src.name} is enabled in FMD2 Engine`
                        : `Enable ${src.name} connector`
                    }
                    onClick={(e) => {
                      e.stopPropagation();
                      if (hasLiveAdapter) onToggleEnableSource(src.id);
                    }}
                    className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors ${
                      hasLiveAdapter ? 'cursor-pointer' : 'cursor-not-allowed opacity-40'
                    } ${
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
              className="w-full py-2 px-3 text-xs font-mono text-violet-300 hover:text-white bg-[#090A0F] border border-white/[0.07] rounded-lg transition-colors text-center cursor-pointer"
            >
              Show More Connectors (+{filteredSourcesList.length - displayedSidebarSources.length})
            </button>
          )}
        </div>
      </aside>

      {/* RIGHT WORKSPACE: Source Header, Dropdown Filter Deck & Live Catalog Grid */}
      <div className="lg:col-span-9 space-y-4 min-w-0">
        {/* Selected Source Banner & Filter Deck */}
        <section className="relative z-30 bg-[#11121A] border border-white/[0.06] rounded-xl p-4 sm:p-5 space-y-3.5">
          {/* Header Block: Source Title & Quick Actions + Genre / Status / Sort by Dropdown Toolbar */}
          <div className="border-b border-white/[0.06] pb-3.5 space-y-3">
            {/* Top Row: Source Title, Lua Module & Sync Status + Quick Utility Buttons */}
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
              <div className="space-y-1 min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-mono text-violet-300">
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
                    className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg border bg-[#090A0F] border-white/[0.07] text-slate-200 hover:border-violet-300/25 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
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
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border bg-[#090A0F] border-white/[0.07] text-slate-300 hover:border-violet-300/25 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Cloud
                      className={`w-3.5 h-3.5 ${
                        cloudSyncStatus === 'syncing'
                          ? 'text-violet-300 animate-pulse'
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
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border bg-[#090A0F] border-white/[0.1] text-slate-200 hover:border-violet-300/25 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 text-violet-300 ${
                      isLoadingLive ? 'animate-spin' : ''
                    }`}
                  />
                  <span>{isLoadingLive ? 'Fetching...' : 'Refresh'}</span>
                </button>

                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={handleResetFilters}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-white/[0.1] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
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
                className="w-full pl-10 pr-3 py-1.5 text-xs bg-[#090A0F] border border-white/[0.07] rounded-lg text-white placeholder:text-slate-500 focus:outline-none focus:border-violet-300/25"
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
                <strong className="text-violet-200">
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
                  <span className="text-violet-200">
                    Genre: {filters.includedGenres.join(', ')}
                  </span>
                </>
              )}
            </div>

            {/* Genres Dropdown Drawer Trigger */}
            <button
              type="button"
              aria-expanded={showAdvancedFilters || filters.includedGenres.length > 0 || filters.excludedGenres.length > 0 || selectedMicroTropes.length > 0}
              onClick={() => setShowAdvancedFilters((v) => !v)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap cursor-pointer ${
                showAdvancedFilters ||
                filters.includedGenres.length > 0 ||
                filters.excludedGenres.length > 0 ||
                selectedMicroTropes.length > 0
                  ? 'bg-violet-500/12 border-violet-300/25 text-violet-200'
                  : 'bg-[#090A0F] border-white/[0.07] text-slate-300 hover:text-white'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>
                Advanced Multi-Genre &amp; Year Filter
                {filters.includedGenres.length + filters.excludedGenres.length + selectedMicroTropes.length > 0
                  ? ` (${filters.includedGenres.length + filters.excludedGenres.length + selectedMicroTropes.length})`
                  : ''}
              </span>
              {showAdvancedFilters ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>
          </div>

          <div className="flex flex-col gap-3 border-t border-white/[0.06] pt-3 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              <span className="mr-1 text-[9px] font-bold uppercase tracking-[0.16em] text-white/35">Saved filters</span>
              {presets.length === 0 && <span className="text-[10px] text-white/30">Save a setup to reuse it later.</span>}
              {presets.map((preset) => (
                <span key={preset.id} className="inline-flex items-center overflow-hidden rounded-md border border-white/[0.08] bg-white/[0.025]">
                  <button type="button" onClick={() => handleApplyPreset(preset.id)} className="px-2.5 py-1.5 text-[10px] font-semibold text-white/65 transition-colors hover:bg-violet-400/10 hover:text-violet-100">{preset.name}</button>
                  <button type="button" onClick={() => deletePreset(preset.id)} aria-label={`Delete ${preset.name} filter preset`} className="border-l border-white/[0.07] px-1.5 py-1.5 text-white/30 transition-colors hover:bg-rose-400/10 hover:text-rose-200"><Trash2 className="h-3 w-3" /></button>
                </span>
              ))}
            </div>
            <form className="flex shrink-0 items-center gap-1.5" onSubmit={(event) => { event.preventDefault(); handleSavePreset(); }}>
              <input aria-label="Saved filter preset name" value={presetName} onChange={(event) => setPresetName(event.target.value)} maxLength={32} placeholder="Name this filter" className="h-8 w-32 rounded-md border border-white/[0.08] bg-black/20 px-2 text-[10px] text-white outline-none placeholder:text-white/25 focus:border-violet-300/35" />
              <button type="submit" disabled={!presetName.trim()} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-violet-300/15 bg-violet-400/10 px-2.5 text-[10px] font-semibold text-violet-100 transition-colors hover:bg-violet-400/20 disabled:cursor-not-allowed disabled:opacity-35"><Save className="h-3 w-3" />Save</button>
            </form>
          </div>

          {/* Collapsible Genre & Year Popover Panel */}
          {(showAdvancedFilters ||
            filters.includedGenres.length > 0 ||
            filters.excludedGenres.length > 0 ||
            selectedMicroTropes.length > 0) && (
            <div className="space-y-3 pt-3 border-t border-white/[0.06]">
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
                      className="w-14 bg-[#090A0F] border border-white/[0.07] rounded px-1.5 py-0.5 text-[11px] font-mono text-white text-center tabular-nums"
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
                      className="w-14 bg-[#090A0F] border border-white/[0.07] rounded px-1.5 py-0.5 text-[11px] font-mono text-white text-center tabular-nums"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowAllGenres((v) => !v)}
                    className="flex items-center gap-1 text-[11px] font-mono text-violet-300 hover:text-violet-200 cursor-pointer"
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
                          : 'bg-[#090A0F] border-white/[0.07] text-slate-300 hover:border-white/[0.1] hover:text-white'
                      }`}
                    >
                      {isIncluded && <Plus className="w-2.5 h-2.5 text-emerald-400" />}
                      {isExcluded && <Minus className="w-2.5 h-2.5 text-rose-400" />}
                      <span>{genre}</span>
                    </button>
                  );
                })}
              </div>

              <div className="border-t border-white/[0.06] pt-3">
                <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold text-white/45">
                  <span>Micro-tropes &amp; tags</span>
                  {selectedMicroTropes.length > 0 && <span className="rounded bg-violet-400/10 px-1.5 py-0.5 text-[9px] text-violet-200">{selectedMicroTropes.length} selected</span>}
                </div>
                {availableMicroTropes.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {availableMicroTropes.map((tag) => {
                      const isSelected = selectedMicroTropes.some((item) => item.toLowerCase() === tag.toLowerCase());
                      return <button key={tag} type="button" aria-pressed={isSelected} onClick={() => setSelectedMicroTropes((current) => isSelected ? current.filter((item) => item.toLowerCase() !== tag.toLowerCase()) : [...current, tag])} className={`rounded-full border px-2.5 py-1 text-[9px] font-medium transition-colors ${isSelected ? 'border-violet-300/25 bg-violet-400/15 text-violet-100' : 'border-white/[0.07] bg-white/[0.02] text-white/45 hover:border-white/15 hover:text-white/75'}`}>{tag}</button>;
                    })}
                  </div>
                ) : <p className="text-[10px] text-white/30">This source has not provided micro-trope tags.</p>}
              </div>
            </div>
          )}
        </section>

        {/* Continue Reading Strip on Main Browse Home Page */}
        {recentlyReadEntries.length > 0 && onResumeSeries && (
          <section
            aria-label="Continue Reading Sessions"
            className="bg-[#11121A] border border-white/[0.07] rounded-xl p-4 space-y-3"
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
                    className="bg-[#090A0F] border border-white/[0.07] hover:border-white/[0.1] rounded-xl p-3 flex items-center gap-3 transition-colors"
                  >
                    <div
                      onClick={() => onResumeSeries(series, progress)}
                      className="w-12 aspect-[3/4] rounded-lg overflow-hidden border border-white/[0.07] shrink-0 cursor-pointer"
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
                <span className="font-mono text-violet-300">
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
            className="flex items-center gap-1.5 text-xs font-mono text-violet-300 hover:text-violet-200 transition-colors"
          >
            <span>
              {isLoadingLive
                ? 'Loading live page...'
                : `Load More Live Series (Page ${currentSourcePage + 1})`}
            </span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {sourceOutcomesNeedingAttention.length > 0 && (
          <section
            role="status"
            aria-live="polite"
            className="flex flex-col gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0 space-y-1">
              <p className="text-sm font-semibold text-amber-200">
                {hasSourceFailures
                  ? 'Some live sources need attention.'
                  : 'Showing previously cached source data.'}
              </p>
              <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-amber-100/80">
                {sourceOutcomesNeedingAttention.map((outcome) => {
                  const sourceName = ALL_FMD2_SOURCES.find((source) => source.id === outcome.sourceId)?.name || outcome.sourceId;
                  const lastUpdated = outcome.fetchedAt
                    ? new Date(outcome.fetchedAt).toLocaleTimeString([], {
                        hour: 'numeric',
                        minute: '2-digit',
                      })
                    : undefined;
                  return (
                    <li key={outcome.sourceId}>
                      <span className="font-medium">{sourceName}:</span> {outcome.message}
                      {outcome.stale && lastUpdated ? ` Last successful refresh ${lastUpdated}.` : ''}
                    </li>
                  );
                })}
              </ul>
            </div>
            <button
              type="button"
              onClick={handleRefreshLiveFeed}
              disabled={isLoadingLive}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-amber-400/30 bg-slate-950/40 px-3 py-2 text-xs font-semibold text-amber-100 transition-colors hover:bg-slate-950/70 disabled:cursor-wait disabled:opacity-60"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoadingLive ? 'animate-spin' : ''}`} />
              Retry sources
            </button>
          </section>
        )}

        {/* Filtered Catalog Grid */}
        {isLoadingLive && filteredCatalog.length === 0 ? (
          <div className="bg-[#11121A] border border-white/[0.07] rounded-xl p-12 text-center space-y-3">
            <RefreshCw className="w-6 h-6 text-violet-300 animate-spin mx-auto" />
            <div className="text-lg font-bold text-white font-display">
              Fetching Live Catalog from{' '}
              {selectedSourceMeta ? selectedSourceMeta.name : 'Verified FMD2 Sources'}...
            </div>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Querying live upstream connectors for real series metadata, covers, genres, and chapter lists.
            </p>
          </div>
        ) : filteredCatalog.length === 0 ? (
          <div className="bg-[#11121A] border border-white/[0.07] rounded-xl p-12 text-center space-y-4">
            <div className="text-lg font-bold text-white font-display">
              {hasSourceFailures
                ? 'Live source unavailable'
                : hasUnsupportedSource
                ? 'This connector is catalogue-only'
                : sourcesReturnedEmpty
                ? 'No live series matched this query'
                : 'No Series Match Your Active Source & Filter Criteria'}
            </div>
            <p className="text-xs sm:text-sm text-slate-400 max-w-md mx-auto">
              {hasSourceFailures
                ? 'The selected source could not return live results. Retry the source or choose another live connector.'
                : hasUnsupportedSource
                ? 'This connector is listed in the FMD2 catalogue, but a live scraper is not available yet.'
                : sourcesReturnedEmpty
                ? 'The selected live sources responded, but none matched this search. Try a different title or adjust your filters.'
                : 'Try clearing excluded genres, lowering the minimum chapter threshold, or refreshing the live source feed.'}
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={handleResetFilters}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold bg-violet-500 hover:bg-violet-400 text-white rounded-lg transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Browse Filters</span>
              </button>
              {!hasUnsupportedSource && (
                <button
                  type="button"
                  onClick={handleRefreshLiveFeed}
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-white/[0.1] transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>{hasSourceFailures ? 'Retry Live Source' : 'Fetch Live From Upstream'}</span>
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredCatalog.slice(0, visibleCardsLimit).map((series, idx) => {
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
                    className="manga-card-interactive animate-card-enter bg-[#11121A] border border-white/[0.07] hover:border-white/[0.1] rounded-xl overflow-hidden flex flex-col justify-between transition-colors"
                    style={{ '--stagger-idx': idx } as React.CSSProperties}
                  >
                    <div className="p-4 flex gap-3.5">
                      {/* 3:4 Cover Art -> Opens Main Manga Page */}
                      <div
                        onClick={() => onInspectSeries(seriesWithSource)}
                        className="w-24 sm:w-28 aspect-[3/4] rounded-lg overflow-hidden border border-white/[0.07] shrink-0 cursor-pointer"
                      >
                        <div className="w-full h-full manga-cover-zoom">
                          <MangaCoverArt series={series} className="w-full h-full" />
                        </div>
                      </div>

                      {/* Unboxed Metadata Hierarchy */}
                      <div className="flex-1 min-w-0 flex flex-col justify-between">
                        <div className="space-y-1">
                          <div className="text-[11px] font-mono text-violet-300 truncate">
                            {sourceMeta.name.toUpperCase()} · {contentFormat.toUpperCase()}
                          </div>

                          <h3 className="text-base font-bold text-white font-display line-clamp-2">
                            <button
                              type="button"
                              onClick={() => onInspectSeries(seriesWithSource)}
                              className="text-left hover:text-violet-200 transition-colors cursor-pointer"
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
                    <div className="px-4 py-2.5 bg-[#090A0F]/90 border-t border-white/[0.06] flex items-center justify-between gap-2">
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
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-violet-500 hover:bg-violet-400 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                      >
                        <BookOpen className="w-3.5 h-3.5" />
                        <span>Manga Page ({series.totalChapters} Ch)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onReadSeriesOnSource(series, effectiveSourceId)}
                        className="flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg border border-white/[0.1] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
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
                  className="px-4 py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-white rounded-lg border border-white/[0.1] transition-colors cursor-pointer"
                >
                  Show More Filtered Results ({filteredCatalog.length - visibleCardsLimit} remaining)
                </button>
              </div>
            )}

            {/* Pagination / Load More Live Data Bar */}
            <div className="bg-[#11121A] border border-white/[0.07] rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="text-xs font-mono text-slate-400">
                Showing {filteredCatalog.length} live series · Upstream Page {currentSourcePage}
              </div>
              <button
                type="button"
                onClick={handleLoadNextPage}
                disabled={isLoadingLive}
                className="flex items-center gap-2 px-4 py-2 bg-violet-500 hover:bg-violet-400 disabled:opacity-60 text-white text-xs font-semibold rounded-lg transition-colors"
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
