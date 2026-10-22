import React, { useState, useMemo, useEffect } from 'react';
import {
  BookOpen,
  Download,
  CheckSquare,
  Square,
  Search,
  Bookmark,
  ArrowLeft,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  CheckCircle2,
  RefreshCw,
  Play,
  History,
  Sparkles,
  ListChecks,
  Layers,
  Star,
  Globe,
  Clock,
  ChevronRight,
  LayoutGrid,
} from 'lucide-react';
import {
  ALL_FMD2_SOURCES,
  FMD2_SOURCE_MODULES,
  DEFAULT_ENABLED_SOURCE_IDS,
  READING_MODES_META,
  resolveSeriesReadingMode,
  getEffectiveSeriesSources,
  parseChapterRangeExpression,
  selectChaptersByRangeBounds,
  resolveNewChaptersForBatch,
  resolveMissingChaptersForBatch,
  computeBatchSelectionStats,
  computeChapterProgressionMap,
  getMissingChaptersFromProgressionMap,
  CHAPTER_SORT_OPTIONS,
  sortSeriesChapters,
  resolveResumeChapter,
  formatRelativeReadTime,
  computeReadingSyncDurationMs,
  formatReadingSyncTime,
  getSeriesContentFormat,
  isChapterInReadLaterQueue,
  type MangaSeries,
  type MangaChapter,
  type SourceId,
  type ArchiveFormat,
  type ReadingMode,
  type FmdEngineConfig,
  type ReadingSessionProgress,
  type DownloadTask,
  type ChapterMapFilter,
  type ChapterProgressionItem,
  type ChapterSortOrder,
  type ReadLaterItem,
} from '../utils/fmdLogic.ts';
import { MangaCoverArt } from './MangaArtRenderer.tsx';
import { DropdownMenu } from './DropdownMenu.tsx';

interface MangaSeriesPageProps {
  series: MangaSeries;
  catalog?: MangaSeries[];
  enabledSources?: SourceId[];
  engineConfig?: FmdEngineConfig;
  onUpdateEngineConfig?: (partial: Partial<FmdEngineConfig>) => void;
  readingProgress?: ReadingSessionProgress | null;
  readingHistory?: Record<string, ReadingSessionProgress>;
  onResumeReading?: (series: MangaSeries, progress: ReadingSessionProgress) => void;
  existingTasks?: DownloadTask[];
  isBookmarked: boolean;
  onToggleBookmark: (mangaId: string) => void;
  onBack: () => void;
  backLabel?: string;
  onSelectSeries?: (series: MangaSeries) => void;
  onReadChapter: (
    series: MangaSeries,
    chapter: MangaChapter,
    preferredMode?: ReadingMode,
    initialPage?: number
  ) => void;
  onQueueChapters: (
    series: MangaSeries,
    chapters: MangaChapter[],
    sourceId: SourceId,
    format: ArchiveFormat
  ) => Promise<{ downloadedFiles?: string[] } | void>;
  onOpenDownloadsTab?: () => void;
  readLaterQueue?: ReadLaterItem[];
  onToggleReadLaterChapter?: (
    series: MangaSeries,
    chapter: MangaChapter,
    sourceId: SourceId
  ) => boolean | void;
}

export const MangaSeriesPage: React.FC<MangaSeriesPageProps> = ({
  series,
  catalog = [],
  enabledSources = DEFAULT_ENABLED_SOURCE_IDS,
  engineConfig,
  onUpdateEngineConfig,
  readingProgress = null,
  readingHistory = {},
  onResumeReading,
  existingTasks = [],
  isBookmarked,
  onToggleBookmark,
  onBack,
  backLabel = 'Back to Catalog',
  onSelectSeries,
  onReadChapter,
  onQueueChapters,
  onOpenDownloadsTab,
  readLaterQueue = [],
  onToggleReadLaterChapter,
}) => {
  const effectiveSources = useMemo(
    () =>
      getEffectiveSeriesSources(series, enabledSources).filter((id) =>
        enabledSources.includes(id)
      ),
    [series, enabledSources]
  );

  const displaySources =
    effectiveSources.length > 0 ? effectiveSources : series.availableSources;

  const modeResolution = useMemo(
    () => resolveSeriesReadingMode(series, engineConfig),
    [series, engineConfig]
  );

  const [activeSource, setActiveSource] = useState<SourceId>(
    () =>
      displaySources.includes(series.primarySource)
        ? series.primarySource
        : displaySources[0] || series.primarySource
  );
  const [archiveFormat, setArchiveFormat] = useState<ArchiveFormat>(
    engineConfig?.defaultFormat || 'CBZ'
  );
  const [selectedReadingMode, setSelectedReadingMode] = useState<ReadingMode>(
    () => modeResolution.mode
  );

  useEffect(() => {
    setSelectedReadingMode(modeResolution.mode);
    setActiveSource(
      displaySources.includes(series.primarySource)
        ? series.primarySource
        : displaySources[0] || series.primarySource
    );
  }, [series.id, series.primarySource, modeResolution.mode]);

  const [chapterQuery, setChapterQuery] = useState('');
  const [visibleChapterLimit, setVisibleChapterLimit] = useState(60);
  const [rangeInput, setRangeInput] = useState('');
  const [rangeStartInput, setRangeStartInput] = useState<string>('1');
  const [rangeEndInput, setRangeEndInput] = useState<string>(() => {
    const nums = series.chapters.map((c) => c.number);
    return nums.length > 0 ? String(Math.max(...nums)) : '1';
  });
  const [selectionModeNote, setSelectionModeNote] = useState<string | null>(null);

  useEffect(() => {
    setVisibleChapterLimit(60);
  }, [series.id, chapterQuery]);
  const [lastClickedChapterId, setLastClickedChapterId] = useState<string | null>(null);
  const [chapterSortOrder, setChapterSortOrder] =
    useState<ChapterSortOrder>('newest-first');
  const sortAsc = chapterSortOrder === 'oldest-first';
  const toggleSortAscDirection = () => {
    setChapterSortOrder((prev) =>
      prev === 'oldest-first' ? 'newest-first' : 'oldest-first'
    );
  };
  const [liveChapters, setLiveChapters] = useState<MangaChapter[]>(series.chapters);
  const [loadingLiveChapters, setLoadingLiveChapters] = useState(false);
  const [selectedChapterIds, setSelectedChapterIds] = useState<Set<string>>(() => {
    const initialNew = resolveNewChaptersForBatch(series.chapters, {
      readingProgress,
      existingTasks,
      seriesId: series.id,
      seriesTitle: series.title,
    });
    if (initialNew.chapterIds.length > 0) {
      return new Set(initialNew.chapterIds);
    }
    return new Set(series.chapters.slice(0, 2).map((c) => c.id));
  });
  const [queueFeedback, setQueueFeedback] = useState<string | null>(null);
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set());
  const [isBatchDownloading, setIsBatchDownloading] = useState(false);

  const sourceModule = useMemo(
    () =>
      ALL_FMD2_SOURCES.find((m) => m.id === activeSource) ||
      FMD2_SOURCE_MODULES.find((m) => m.id === activeSource) ||
      ALL_FMD2_SOURCES[0],
    [activeSource]
  );

  // Reset live chapters immediately when switching series, then fetch live chapters from upstream
  useEffect(() => {
    setLiveChapters(series.chapters);
    setQueueFeedback(null);
    setSelectionModeNote(null);
    setDownloadAllMissingToggle(false);
  }, [series.id, series.chapters]);

  useEffect(() => {
    let isMounted = true;
    setLoadingLiveChapters(true);

    const fetchLiveChapters = async () => {
      try {
        const res = await fetch(
          `/api/manga/chapters?title=${encodeURIComponent(
            series.title
          )}&sourceId=${encodeURIComponent(activeSource)}&seriesId=${encodeURIComponent(
            series.id
          )}&slug=${encodeURIComponent(series.slug)}`
        );
        if (!res.ok) return;
        const data = (await res.json()) as { chapters?: MangaChapter[] };
        if (isMounted && Array.isArray(data.chapters) && data.chapters.length > 0) {
          setLiveChapters(data.chapters);
          const nums = data.chapters.map((c) => c.number);
          setRangeStartInput(String(Math.min(...nums)));
          setRangeEndInput(String(Math.max(...nums)));
          const resolvedNew = resolveNewChaptersForBatch(data.chapters, {
            readingProgress,
            existingTasks,
            seriesId: series.id,
            seriesTitle: series.title,
          });
          setSelectedChapterIds(
            new Set(
              resolvedNew.chapterIds.length > 0
                ? resolvedNew.chapterIds
                : data.chapters.slice(0, 2).map((c) => c.id)
            )
          );
        }
      } catch {
        // Keep series.chapters fallback
      } finally {
        if (isMounted) setLoadingLiveChapters(false);
      }
    };

    fetchLiveChapters();
    return () => {
      isMounted = false;
    };
  }, [series.id, series.title, series.slug, activeSource]);

  const availableChapterNumbers = useMemo(
    () => liveChapters.map((c) => c.number).sort((a, b) => a - b),
    [liveChapters]
  );

  const minChapterNum = availableChapterNumbers[0] ?? 1;
  const maxChapterNum =
    availableChapterNumbers[availableChapterNumbers.length - 1] ?? 1;

  const newChaptersResolution = useMemo(
    () =>
      resolveNewChaptersForBatch(liveChapters, {
        readingProgress,
        existingTasks,
        seriesId: series.id,
        seriesTitle: series.title,
      }),
    [liveChapters, readingProgress, existingTasks, series.id, series.title]
  );

  const newChapterIdSet = useMemo(
    () => new Set(newChaptersResolution.chapterIds),
    [newChaptersResolution.chapterIds]
  );

  const queuedChapterNumberSet = useMemo(
    () => new Set(newChaptersResolution.queuedOrDownloadedNumbers),
    [newChaptersResolution.queuedOrDownloadedNumbers]
  );

  const missingChapters = useMemo(
    () =>
      resolveMissingChaptersForBatch(liveChapters, {
        existingTasks,
        seriesId: series.id,
        seriesTitle: series.title,
      }),
    [liveChapters, existingTasks, series.id, series.title]
  );

  const selectionStats = useMemo(
    () => computeBatchSelectionStats(liveChapters, selectedChapterIds),
    [liveChapters, selectedChapterIds]
  );

  const [mapFilter, setMapFilter] = useState<ChapterMapFilter>('all');
  const [mapActionMode, setMapActionMode] = useState<'read' | 'select'>('read');
  const [downloadAllMissingToggle, setDownloadAllMissingToggle] = useState<boolean>(false);
  const [hoveredMapItem, setHoveredMapItem] = useState<ChapterProgressionItem | null>(
    null
  );

  const progressionMap = useMemo(
    () =>
      computeChapterProgressionMap(liveChapters, {
        readingProgress,
        existingTasks,
        seriesId: series.id,
        seriesTitle: series.title,
        selectedChapterIds,
      }),
    [liveChapters, readingProgress, existingTasks, series.id, series.title, selectedChapterIds]
  );

  const missingFromProgressionMap = useMemo(
    () => getMissingChaptersFromProgressionMap(progressionMap),
    [progressionMap]
  );

  const isDownloadAllMissingActive =
    downloadAllMissingToggle ||
    (progressionMap.totalChapters > 0 && progressionMap.missingCount === 0);

  const progressionItemById = useMemo(() => {
    const map = new Map<string, ChapterProgressionItem>();
    for (const item of progressionMap.items) {
      map.set(item.chapterId, item);
    }
    return map;
  }, [progressionMap.items]);

  const filteredChapters = useMemo(() => {
    const q = chapterQuery.trim().toLowerCase();
    const list = liveChapters.filter((ch) => {
      if (mapFilter !== 'all') {
        const item = progressionItemById.get(ch.id);
        if (mapFilter === 'read' && !item?.isRead) return false;
        if (mapFilter === 'downloaded' && !item?.isDownloaded) return false;
        if (mapFilter === 'missing' && !item?.isMissing) return false;
      }
      if (!q) return true;
      return (
        String(ch.number).includes(q) ||
        ch.title.toLowerCase().includes(q) ||
        ch.scanlationGroup.toLowerCase().includes(q)
      );
    });
    return sortSeriesChapters(list, chapterSortOrder, readingProgress);
  }, [
    liveChapters,
    chapterQuery,
    chapterSortOrder,
    readingProgress,
    mapFilter,
    progressionItemById,
  ]);

  const toggleChapter = (id: string, shiftKey: boolean = false) => {
    if (shiftKey && lastClickedChapterId && lastClickedChapterId !== id) {
      const idxA = filteredChapters.findIndex((c) => c.id === lastClickedChapterId);
      const idxB = filteredChapters.findIndex((c) => c.id === id);
      if (idxA !== -1 && idxB !== -1) {
        const low = Math.min(idxA, idxB);
        const high = Math.max(idxA, idxB);
        const sliceIds = filteredChapters.slice(low, high + 1).map((c) => c.id);
        setSelectedChapterIds((prev) => {
          const next = new Set(prev);
          for (const sid of sliceIds) next.add(sid);
          return next;
        });
        setLastClickedChapterId(id);
        setSelectionModeNote(`Shift-selected ${sliceIds.length} chapters in table order`);
        return;
      }
    }

    setLastClickedChapterId(id);
    setSelectedChapterIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    const allFilteredSelected =
      filteredChapters.length > 0 &&
      filteredChapters.every((c) => selectedChapterIds.has(c.id));
    if (allFilteredSelected) {
      setSelectedChapterIds(new Set());
      setSelectionModeNote('Cleared chapter selection');
    } else {
      setSelectedChapterIds(new Set(filteredChapters.map((c) => c.id)));
      setSelectionModeNote(`Selected all ${filteredChapters.length} listed chapters`);
    }
  };

  const handleSelectAllNew = () => {
    setSelectedChapterIds(new Set(newChaptersResolution.chapterIds));
    setSelectionModeNote(
      `Selected ${newChaptersResolution.chapterIds.length} new chapter${
        newChaptersResolution.chapterIds.length === 1 ? '' : 's'
      } (${newChaptersResolution.reason})`
    );
  };

  const handleSelectUnreadAfterProgress = () => {
    if (!readingProgress) return;
    const ids = newChaptersResolution.unreadIds;
    setSelectedChapterIds(new Set(ids));
    setSelectionModeNote(
      `Selected ${ids.length} unread chapter${
        ids.length === 1 ? '' : 's'
      } after Ch. ${readingProgress.chapterNumber}`
    );
  };

  const handleSelectUnqueuedOnly = () => {
    const ids = newChaptersResolution.undownloadedIds;
    setSelectedChapterIds(new Set(ids));
    setSelectionModeNote(
      `Selected ${ids.length} chapter${
        ids.length === 1 ? '' : 's'
      } not yet in download queue`
    );
  };

  const handleInvertSelection = () => {
    const next = new Set<string>();
    for (const ch of filteredChapters) {
      if (!selectedChapterIds.has(ch.id)) {
        next.add(ch.id);
      }
    }
    setSelectedChapterIds(next);
    setSelectionModeNote(`Inverted selection (${next.size} selected)`);
  };

  const handleApplyBoundsRange = (append: boolean = false) => {
    const startNum = rangeStartInput.trim() !== '' ? Number(rangeStartInput) : null;
    const endNum = rangeEndInput.trim() !== '' ? Number(rangeEndInput) : null;
    const matchedIds = selectChaptersByRangeBounds(liveChapters, startNum, endNum);
    if (matchedIds.length === 0) {
      setSelectionModeNote('No chapters matched that From–To range');
      return;
    }
    setSelectedChapterIds((prev) => {
      if (!append) return new Set(matchedIds);
      const next = new Set(prev);
      for (const id of matchedIds) next.add(id);
      return next;
    });
    const low =
      startNum !== null && endNum !== null
        ? Math.min(startNum, endNum)
        : startNum ?? minChapterNum;
    const high =
      startNum !== null && endNum !== null
        ? Math.max(startNum, endNum)
        : endNum ?? maxChapterNum;
    setSelectionModeNote(
      `${append ? 'Added' : 'Selected'} ${matchedIds.length} chapter${
        matchedIds.length === 1 ? '' : 's'
      } in range Ch. ${low}–${high}`
    );
  };

  const handleApplyRange = (e: React.FormEvent, append: boolean = false) => {
    e.preventDefault();
    const nums = parseChapterRangeExpression(rangeInput, availableChapterNumbers);
    if (nums.size === 0) {
      setSelectionModeNote('Enter a valid range expression (e.g. 1-5, 8, or 3+)');
      return;
    }
    const matched = liveChapters.filter((c) => nums.has(c.number)).map((c) => c.id);
    setSelectedChapterIds((prev) => {
      if (!append) return new Set(matched);
      const next = new Set(prev);
      for (const id of matched) next.add(id);
      return next;
    });
    setSelectionModeNote(
      `${append ? 'Added' : 'Selected'} ${matched.length} chapter${
        matched.length === 1 ? '' : 's'
      } matching "${rangeInput.trim()}"`
    );
  };

  const handleBatchDownload = async () => {
    const chosen = liveChapters.filter((c) => selectedChapterIds.has(c.id));
    if (chosen.length === 0) return;
    setIsBatchDownloading(true);
    try {
      const result = await onQueueChapters(series, chosen, activeSource, archiveFormat);
      const files = result?.downloadedFiles || [];
      if (files.length > 0) {
        setQueueFeedback(
          `Downloaded ${files.join(', ')} (${archiveFormat}) via ${sourceModule.luaModule}`
        );
      } else {
        setQueueFeedback(
          `Packed & downloaded ${chosen.length} chapter${
            chosen.length > 1 ? 's' : ''
          } (${archiveFormat}) via ${sourceModule.luaModule}`
        );
      }
    } finally {
      setIsBatchDownloading(false);
    }
  };

  const handleBatchDownloadAllMissing = async () => {
    const targetMissing =
      missingFromProgressionMap.length > 0 ? missingFromProgressionMap : missingChapters;
    if (targetMissing.length === 0 || isBatchDownloading) return;
    const missingIds = targetMissing.map((c) => c.id);
    setDownloadAllMissingToggle(true);
    setSelectedChapterIds(new Set(missingIds));
    setSelectionModeNote(
      `Download All Missing active · Queued all ${targetMissing.length} missing chapter${
        targetMissing.length === 1 ? '' : 's'
      } from progression map`
    );
    setIsBatchDownloading(true);
    try {
      const result = await onQueueChapters(
        series,
        targetMissing,
        activeSource,
        archiveFormat
      );
      const files = result?.downloadedFiles || [];
      if (files.length > 0) {
        setQueueFeedback(
          `Added all ${targetMissing.length} missing chapter${
            targetMissing.length === 1 ? '' : 's'
          } from progression map to queue · Saved ${files.join(', ')} (${archiveFormat}) via ${
            sourceModule.luaModule
          }`
        );
      } else {
        setQueueFeedback(
          `Added all ${targetMissing.length} missing chapter${
            targetMissing.length === 1 ? '' : 's'
          } (${archiveFormat}) from progression map to download queue via ${sourceModule.luaModule}`
        );
      }
    } finally {
      setIsBatchDownloading(false);
    }
  };

  const handleToggleDownloadAllMissing = async () => {
    const targetMissing =
      missingFromProgressionMap.length > 0 ? missingFromProgressionMap : missingChapters;

    if (downloadAllMissingToggle && targetMissing.length === 0) {
      setDownloadAllMissingToggle(false);
      setSelectionModeNote('Download All Missing toggle turned off');
      return;
    }

    setDownloadAllMissingToggle(true);
    if (targetMissing.length > 0) {
      await handleBatchDownloadAllMissing();
    } else {
      setQueueFeedback(
        `All ${progressionMap.totalChapters} chapters in the progression map are already queued or downloaded.`
      );
    }
  };

  const handleSingleChapterDownload = async (ch: MangaChapter) => {
    setDownloadingIds((prev) => new Set(prev).add(ch.id));
    try {
      const result = await onQueueChapters(series, [ch], activeSource, archiveFormat);
      const files = result?.downloadedFiles || [];
      setQueueFeedback(
        files.length > 0
          ? `Downloaded ${files[0]} via ${sourceModule.luaModule}`
          : `Downloaded Ch. ${ch.number} (${archiveFormat}) via ${sourceModule.luaModule}`
      );
    } finally {
      setDownloadingIds((prev) => {
        const next = new Set(prev);
        next.delete(ch.id);
        return next;
      });
    }
  };

  const firstChapter = useMemo(() => {
    if (liveChapters.length === 0) return undefined;
    return (
      liveChapters.find((c) => c.number === 1) ||
      [...liveChapters].sort((a, b) => a.number - b.number)[0]
    );
  }, [liveChapters]);

  const latestChapter = useMemo(() => {
    if (liveChapters.length === 0) return undefined;
    return [...liveChapters].sort((a, b) => b.number - a.number)[0];
  }, [liveChapters]);

  const seriesWithLiveChapters: MangaSeries = useMemo(
    () => ({
      ...series,
      primarySource: activeSource,
      chapters: liveChapters,
      totalChapters: Math.max(series.totalChapters, liveChapters.length),
    }),
    [series, activeSource, liveChapters]
  );

  const relatedSeries = useMemo(() => {
    return catalog
      .filter((item) => item.id !== series.id)
      .sort((a, b) => {
        const aSharedGenres = a.genres.filter((g) => series.genres.includes(g)).length;
        const bSharedGenres = b.genres.filter((g) => series.genres.includes(g)).length;
        if (bSharedGenres !== aSharedGenres) return bSharedGenres - aSharedGenres;
        const aSameSource = a.primarySource === series.primarySource ? 1 : 0;
        const bSameSource = b.primarySource === series.primarySource ? 1 : 0;
        return bSameSource - aSameSource;
      })
      .slice(0, 4);
  }, [catalog, series]);

  const contentFormat = getSeriesContentFormat(series);
  const displayAltTitles = useMemo(
    () => (series.altTitles || []).filter((t) => !/^https?:\/\//i.test(t.trim())),
    [series.altTitles]
  );

  return (
    <div className="space-y-8" data-testid="manga-series-main-page">
      {/* Top Breadcrumb Bar */}
      <nav
        aria-label="Manga Page Breadcrumb"
        className="studio-panel flex flex-wrap items-center justify-between gap-3 bg-[#11121A] border border-white/[0.07] rounded-xl px-4 py-2.5"
      >
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:text-white bg-[#090A0F] hover:bg-slate-800 border border-white/[0.07] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>{backLabel}</span>
          </button>

          <ChevronRight className="w-3.5 h-3.5 text-slate-600 shrink-0" />

          <span className="text-xs font-medium text-violet-400 shrink-0">
            {sourceModule.name}
          </span>

          <ChevronRight className="w-3.5 h-3.5 text-slate-600 shrink-0" />

          <span className="text-xs font-semibold text-white truncate max-w-[260px] sm:max-w-md">
            {series.title}
          </span>
        </div>

        {loadingLiveChapters && (
          <div className="text-xs font-mono text-violet-400 inline-flex items-center gap-1.5">
            <RefreshCw className="w-3 h-3 animate-spin" />
            <span>Syncing live chapters...</span>
          </div>
        )}
      </nav>

      {/* Main Manga Series Hero Overview Card */}
      <section
        aria-labelledby="manga-main-page-title"
        className="studio-panel bg-[#11121A] border border-white/[0.07] rounded-xl p-6"
      >
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
          {/* Left Column: 3:4 Cover Art & Save to Library Button */}
          <div className="md:col-span-3 lg:col-span-3 max-w-[220px] mx-auto md:max-w-none w-full space-y-3">
            <div className="aspect-[3/4] w-full rounded-xl overflow-hidden border border-white/[0.1]/80 bg-[#090A0F]">
              <MangaCoverArt series={series} className="w-full h-full" />
            </div>

            <button
              type="button"
              onClick={() => onToggleBookmark(series.id)}
              className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                isBookmarked
                  ? 'bg-violet-600/20 border-violet-500 text-violet-300'
                  : 'bg-[#090A0F] border-white/[0.07] text-slate-200 hover:border-white/[0.1] hover:text-white'
              }`}
            >
              <Bookmark className="w-4 h-4" />
              <span>{isBookmarked ? 'Saved in Library' : 'Add to Saved Library'}</span>
            </button>
          </div>

          {/* Right Column: Series Title, Synopsis, Primary CTAs & Source/Format Controls */}
          <div className="md:col-span-9 lg:col-span-9 space-y-4">
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2 text-xs text-violet-400 font-medium">
                <Globe className="w-3.5 h-3.5 shrink-0" />
                <span>{sourceModule.name}</span>
                <span aria-hidden="true">·</span>
                <span className="text-slate-400 font-mono tabular-nums">
                  {liveChapters.length} Chapters
                </span>
                <span aria-hidden="true">·</span>
                <span className="text-slate-400">{contentFormat}</span>
              </div>

              <h1
                id="manga-main-page-title"
                className="text-2xl sm:text-3xl font-bold tracking-tight text-white font-display [text-wrap:balance]"
              >
                {series.title}
              </h1>

              {displayAltTitles.length > 0 && (
                <div className="text-xs text-slate-400 truncate">
                  {displayAltTitles.slice(0, 2).join(' · ')}
                </div>
              )}

              {/* Metadata Line */}
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300 pt-0.5">
                <span className="font-semibold text-white">{series.author}</span>
                {series.artist && series.artist !== series.author && (
                  <>
                    <span aria-hidden="true" className="text-slate-600">·</span>
                    <span>Art by {series.artist}</span>
                  </>
                )}
                <span aria-hidden="true" className="text-slate-600">·</span>
                <span className="text-emerald-400 font-medium">{series.status}</span>
                <span aria-hidden="true" className="text-slate-600">·</span>
                <span className="font-mono tabular-nums">{series.year}</span>
                <span aria-hidden="true" className="text-slate-600">·</span>
                <span className="font-mono tabular-nums text-amber-400 inline-flex items-center gap-1">
                  <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                  {series.rating.toFixed(1)} / 10
                </span>
              </div>

              {/* Genres Line */}
              <div className="text-xs text-slate-400">
                {series.genres.join(' · ')}
              </div>
            </div>

            {/* Synopsis */}
            <p className="text-sm text-slate-200 leading-relaxed max-w-3xl">
              {series.synopsis}
            </p>

            {/* Active Reading Progress Banner if available */}
            {readingProgress && (
              <div className="studio-subpanel bg-[#090A0F] border border-amber-500/40 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-amber-300 tabular-nums">
                  <History className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>
                    Continue Ch. {readingProgress.chapterNumber} · Page {readingProgress.lastPage}/{readingProgress.totalPages}
                  </span>
                  <span aria-hidden="true" className="text-slate-600">·</span>
                  <span className="text-slate-400">
                    {formatRelativeReadTime(readingProgress.updatedAt)}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (onResumeReading) {
                      onResumeReading(seriesWithLiveChapters, readingProgress);
                    } else {
                      const resumeCh = resolveResumeChapter(
                        seriesWithLiveChapters,
                        readingProgress
                      );
                      onReadChapter(
                        seriesWithLiveChapters,
                        resumeCh,
                        readingProgress.readingMode || selectedReadingMode,
                        readingProgress.lastPage
                      );
                    }
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-lg transition-colors whitespace-nowrap shrink-0 tabular-nums cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 fill-slate-950" />
                  <span>
                    Resume Ch. {readingProgress.chapterNumber}
                  </span>
                </button>
              </div>
            )}

            {/* Primary Action Buttons */}
            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              {firstChapter && (
                <button
                  type="button"
                  onClick={() =>
                    onReadChapter(seriesWithLiveChapters, firstChapter, selectedReadingMode)
                  }
                  className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 tabular-nums cursor-pointer"
                >
                  <BookOpen className="w-4 h-4" />
                  <span>Start Reading Ch. {firstChapter.number}</span>
                </button>
              )}

              {latestChapter && latestChapter.id !== firstChapter?.id && (
                <button
                  type="button"
                  onClick={() =>
                    onReadChapter(seriesWithLiveChapters, latestChapter, selectedReadingMode)
                  }
                  className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-medium rounded-lg border border-white/[0.1] transition-colors whitespace-nowrap shrink-0 tabular-nums cursor-pointer"
                >
                  <BookOpen className="w-4 h-4" />
                  <span>Read Latest (Ch. {latestChapter.number})</span>
                </button>
              )}

              {/* Download All Missing Toggle Switch in Primary Action Bar */}
              <button
                type="button"
                role="switch"
                aria-checked={isDownloadAllMissingActive}
                onClick={() => void handleToggleDownloadAllMissing()}
                disabled={isBatchDownloading}
                title={
                  missingFromProgressionMap.length > 0
                    ? `Toggle on to immediately queue all ${missingFromProgressionMap.length} missing chapter${
                        missingFromProgressionMap.length === 1 ? '' : 's'
                      } from the chapter progression map`
                    : 'All chapters in this series are already in the download queue'
                }
                className={`flex items-center gap-2.5 px-3.5 py-2 disabled:opacity-40 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  isDownloadAllMissingActive
                    ? 'bg-emerald-600/20 text-emerald-200 border-emerald-500/70'
                    : 'bg-[#090A0F] hover:bg-slate-800 text-slate-200 border-white/[0.07]'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors ${
                    isDownloadAllMissingActive ? 'bg-emerald-500' : 'bg-slate-700'
                  }`}
                >
                  <span
                    className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                      isDownloadAllMissingActive ? 'translate-x-3.5' : 'translate-x-0.5'
                    }`}
                  />
                </span>
                <span className="tabular-nums">
                  {missingFromProgressionMap.length > 0
                    ? `Download All Missing (${missingFromProgressionMap.length})`
                    : 'Download All Missing (0 Missing)'}
                </span>
              </button>

              {selectedChapterIds.size > 0 && (
                <button
                  type="button"
                  onClick={handleBatchDownload}
                  disabled={isBatchDownloading}
                  className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span className="tabular-nums">
                    {isBatchDownloading
                      ? `Packing (${selectedChapterIds.size})...`
                      : `Download Selected (${selectedChapterIds.size}) as ${archiveFormat}`}
                  </span>
                </button>
              )}
            </div>

            {queueFeedback && (
              <div
                role="status"
                className="text-xs text-emerald-300 bg-emerald-950/60 border border-emerald-700/60 rounded-lg px-4 py-2.5 flex flex-wrap items-center justify-between gap-3"
              >
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{queueFeedback}</span>
                </div>
                {onOpenDownloadsTab && (
                  <button
                    type="button"
                    onClick={onOpenDownloadsTab}
                    className="text-xs font-semibold text-white bg-emerald-700/60 hover:bg-emerald-600 px-3 py-1 rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Open Downloads →
                  </button>
                )}
              </div>
            )}

            {/* Sleek Custom Dropdown Menu UI for Source Mirror, Download Format & Reader Mode */}
            <div className="pt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 border-t border-white/[0.06]">
              <DropdownMenu<SourceId>
                id="series-source-mirror-select"
                label="Source"
                ariaLabel="Source Mirror"
                icon={<Globe className="w-3.5 h-3.5" />}
                value={activeSource}
                options={displaySources.map((srcId) => {
                  const mod =
                    ALL_FMD2_SOURCES.find((m) => m.id === srcId) ||
                    FMD2_SOURCE_MODULES.find((m) => m.id === srcId);
                  return {
                    value: srcId,
                    label: mod ? `${mod.name} (${mod.domain})` : srcId,
                    description: mod ? `${mod.luaModule} · ${mod.category}` : undefined,
                    badge: mod ? `${mod.avgResponseMs}ms` : undefined,
                  };
                })}
                menuWidthClass="w-72"
                className="w-full"
                onChange={(val) => setActiveSource(val)}
              />

              <DropdownMenu<ArchiveFormat>
                id="series-archive-format-select"
                label="Format"
                ariaLabel="Download Format"
                value={archiveFormat}
                options={(['CBZ', 'ZIP'] as ArchiveFormat[]).map(
                  (fmt) => ({
                    value: fmt,
                    label: `${fmt} Archive`,
                      description:
                        fmt === 'CBZ'
                          ? 'Comic Book ZIP with ComicInfo.xml'
                          : 'Standard ZIP containing chapter images',
                  })
                )}
                menuWidthClass="w-64"
                className="w-full"
                onChange={(val) => setArchiveFormat(val)}
              />

              <DropdownMenu<ReadingMode>
                id="series-reading-mode-select"
                label="Mode"
                ariaLabel="Reading Mode"
                value={selectedReadingMode}
                options={READING_MODES_META.map((mode) => ({
                  value: mode.id,
                  label: mode.shortLabel,
                  description: mode.description,
                }))}
                align="right"
                menuWidthClass="w-64"
                className="w-full"
                onChange={(val) => setSelectedReadingMode(val)}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Visual Chapter Progression Map (Read / Downloaded / Missing Mini-Indicators) */}
      <section
        aria-label="Visual Chapter Progression Map"
        data-testid="chapter-progression-map"
        className="studio-panel bg-[#11121A] border border-white/[0.07] rounded-xl p-5 space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-white font-display flex items-center gap-2">
              <LayoutGrid className="w-4 h-4 text-violet-400 shrink-0" />
              <span>Chapter Progression Map</span>
              <span className="text-xs font-mono font-normal text-slate-400 tabular-nums">
                ({progressionMap.totalChapters} chapters)
              </span>
            </h2>
          </div>

          {/* Click Behavior Toggle Switch & Download All Missing Toggle Switch */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={isDownloadAllMissingActive}
              aria-label="Download All Missing"
              data-testid="download-all-missing-toggle"
              disabled={isBatchDownloading}
              onClick={() => void handleToggleDownloadAllMissing()}
              title={
                progressionMap.missingCount > 0
                  ? `Activate to immediately queue all ${progressionMap.missingCount} missing chapters from the progression map into the download queue`
                  : 'All chapters in the progression map are queued or downloaded'
              }
              className={`inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all whitespace-nowrap shrink-0 tabular-nums cursor-pointer ${
                isDownloadAllMissingActive
                  ? 'bg-emerald-600/20 border-emerald-500 text-emerald-200 shadow-sm'
                  : 'bg-[#090A0F] hover:bg-slate-800/90 border-white/[0.1] text-slate-200 hover:border-teal-500/60'
              }`}
            >
              <span
                aria-hidden="true"
                className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors ${
                  isDownloadAllMissingActive ? 'bg-emerald-500' : 'bg-slate-700'
                }`}
              >
                <span
                  className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                    isDownloadAllMissingActive ? 'translate-x-3.5' : 'translate-x-0.5'
                  }`}
                />
              </span>
              <Download className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>
                {isBatchDownloading
                  ? `Queueing (${progressionMap.missingCount})...`
                  : progressionMap.missingCount > 0
                  ? `Download All Missing (${progressionMap.missingCount})`
                  : `Download All Missing (All Queued)`}
              </span>
            </button>

            <button
              type="button"
              role="switch"
              aria-checked={mapActionMode === 'select'}
              aria-label="Toggle map click to select mode"
              onClick={() =>
                setMapActionMode((prev) => (prev === 'read' ? 'select' : 'read'))
              }
              className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium bg-[#090A0F] border border-white/[0.07] rounded-lg text-slate-200 hover:text-white cursor-pointer"
            >
              <span>{mapActionMode === 'select' ? 'Click: Select' : 'Click: Read'}</span>
              <span
                aria-hidden="true"
                className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors ${
                  mapActionMode === 'select' ? 'bg-violet-600' : 'bg-slate-700'
                }`}
              >
                <span
                  className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                    mapActionMode === 'select' ? 'translate-x-3.5' : 'translate-x-0.5'
                  }`}
                />
              </span>
            </button>
          </div>
        </div>

        {/* Multi-Segment Progression Bar & Status Filter Dropdown */}
        <div className="studio-subpanel bg-[#090A0F] border border-white/[0.07]/90 rounded-xl p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-mono tabular-nums">
            <div className="flex flex-wrap items-center gap-2 text-slate-300">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-amber-400 inline-block shrink-0" />
                <span className="text-amber-300 font-semibold">
                  Read: {progressionMap.readCount}/{progressionMap.totalChapters} ({progressionMap.readPct}%)
                </span>
              </span>
              <span aria-hidden="true" className="text-slate-600">·</span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block shrink-0" />
                <span className="text-emerald-300 font-semibold">
                  Downloaded: {progressionMap.downloadedCount}/{progressionMap.totalChapters} ({progressionMap.downloadedPct}%)
                </span>
              </span>
              <span aria-hidden="true" className="text-slate-600">·</span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-slate-800 border border-slate-600 inline-block shrink-0" />
                <span className="text-slate-300 font-semibold">
                  Missing: {progressionMap.missingCount}/{progressionMap.totalChapters} ({progressionMap.missingPct}%)
                </span>
              </span>
            </div>

            {/* Chapter Status Filter Custom Dropdown UI */}
            <DropdownMenu<ChapterMapFilter>
              id="progression-status-filter-select"
              label="Show"
              ariaLabel="Filter chapters by progression status"
              value={mapFilter}
              options={[
                {
                  value: 'all',
                  label: 'All',
                  badge: progressionMap.totalChapters,
                  description: 'Show all chapters in progression map',
                },
                {
                  value: 'read',
                  label: 'Read',
                  badge: progressionMap.readCount,
                  accentDotColor: 'bg-amber-400',
                  description: 'Chapters you have already read',
                },
                {
                  value: 'downloaded',
                  label: 'Downloaded',
                  badge: progressionMap.downloadedCount,
                  accentDotColor: 'bg-emerald-400',
                  description: 'Chapters saved or queued in downloader',
                },
                {
                  value: 'missing',
                  label: 'Missing',
                  badge: progressionMap.missingCount,
                  accentDotColor: 'bg-slate-500',
                  description: 'Chapters not yet in download queue',
                },
              ]}
              align="right"
              menuWidthClass="w-60"
              onChange={(val) => setMapFilter(val)}
            />
          </div>

          {/* Segmented Visual Progress Strip */}
          <div
            className="w-full h-2 bg-slate-900 rounded-full overflow-hidden flex border border-white/[0.06]"
            aria-label="Series library and reading completion bar"
          >
            {progressionMap.items.map((item) => {
              const segmentColor = item.isLastRead
                ? 'bg-amber-400'
                : item.isRead && item.isDownloaded
                ? 'bg-teal-400'
                : item.isRead
                ? 'bg-amber-500/85'
                : item.isDownloaded
                ? 'bg-emerald-500/85'
                : 'bg-slate-800/60';
              return (
                <div
                  key={`seg-${item.chapterId}`}
                  title={`Ch. ${item.chapterNumber} · ${item.statusLabel}`}
                  className={`h-full flex-1 border-r border-slate-950/40 last:border-r-0 transition-colors ${segmentColor}`}
                />
              );
            })}
          </div>

          {/* Mini-Indicator Grid */}
          <div
            className="grid grid-cols-6 sm:grid-cols-10 md:grid-cols-12 lg:grid-cols-16 xl:grid-cols-20 gap-1.5 pt-1 max-h-56 overflow-y-auto pr-1"
            role="list"
            aria-label="Chapter progression mini-indicators"
          >
            {progressionMap.items.map((item) => {
              const matchesFilter =
                mapFilter === 'all' ||
                (mapFilter === 'read' && item.isRead) ||
                (mapFilter === 'downloaded' && item.isDownloaded) ||
                (mapFilter === 'missing' && item.isMissing);

              const stateClasses = item.isLastRead
                ? 'bg-amber-500/25 border-amber-400 text-amber-200 ring-1 ring-amber-400/60'
                : item.isRead && item.isDownloaded
                ? 'bg-emerald-950/70 border-amber-400/70 text-emerald-200'
                : item.isRead
                ? 'bg-amber-950/45 border-amber-500/50 text-amber-200'
                : item.isDownloaded
                ? 'bg-emerald-950/55 border-emerald-500/55 text-emerald-200'
                : 'bg-[#11121A]/90 border-white/[0.07] text-slate-400 hover:border-slate-600 hover:text-slate-200';

              const selectedRing = item.isSelected
                ? 'ring-2 ring-violet-500 border-violet-400'
                : '';

              return (
                <button
                  key={`map-cell-${item.chapterId}`}
                  type="button"
                  role="listitem"
                  data-testid={`chapter-map-indicator-${item.chapterNumber}`}
                  data-status={item.visualState}
                  onMouseEnter={() => setHoveredMapItem(item)}
                  onFocus={() => setHoveredMapItem(item)}
                  onClick={(e) => {
                    if (e.shiftKey || mapActionMode === 'select') {
                      toggleChapter(item.chapterId, e.shiftKey);
                    } else {
                      onReadChapter(
                        seriesWithLiveChapters,
                        item.chapter,
                        selectedReadingMode,
                        item.isLastRead && readingProgress ? readingProgress.lastPage : 1
                      );
                    }
                  }}
                  title={`Ch. ${item.chapterNumber}: ${item.title} — ${item.statusLabel}${
                    item.isSelected ? ' (Selected for download)' : ''
                  }`}
                  aria-label={`Chapter ${item.chapterNumber}: ${item.statusLabel}`}
                  className={`relative h-8 px-1.5 rounded-md border text-[11px] font-mono tabular-nums font-semibold flex items-center justify-between gap-1 transition-all cursor-pointer select-none ${stateClasses} ${selectedRing} ${
                    matchesFilter ? 'opacity-100' : 'opacity-25'
                  }`}
                >
                  <span className="truncate">{item.chapterNumber}</span>
                  <span className="flex items-center gap-0.5 shrink-0">
                    {item.isRead && (
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          item.isLastRead ? 'bg-amber-300' : 'bg-amber-400'
                        }`}
                        aria-hidden="true"
                      />
                    )}
                    {item.isDownloaded ? (
                      <span
                        className="w-1.5 h-1.5 rounded-full bg-emerald-400"
                        aria-hidden="true"
                      />
                    ) : (
                      !item.isRead && (
                        <span
                          className="w-1.5 h-1.5 rounded-full bg-slate-600"
                          aria-hidden="true"
                        />
                      )
                    )}
                  </span>
                </button>
              );
            })}
          </div>

          {hoveredMapItem && (
            <div className="pt-2 border-t border-white/[0.06] flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
              <div className="flex flex-wrap items-center gap-2 text-slate-300 min-w-0">
                <span className="text-white font-bold tabular-nums">
                  Ch. {String(hoveredMapItem.chapterNumber).padStart(3, '0')}
                </span>
                <span aria-hidden="true" className="text-slate-600">·</span>
                <span className="text-slate-200 truncate max-w-xs">
                  {hoveredMapItem.title}
                </span>
                <span aria-hidden="true" className="text-slate-600">·</span>
                <span
                  className={
                    hoveredMapItem.isLastRead || hoveredMapItem.isRead
                      ? 'text-amber-400'
                      : hoveredMapItem.isDownloaded
                      ? 'text-emerald-400'
                      : 'text-slate-400'
                  }
                >
                  {hoveredMapItem.statusLabel}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    onReadChapter(
                      seriesWithLiveChapters,
                      hoveredMapItem.chapter,
                      selectedReadingMode,
                      hoveredMapItem.isLastRead && readingProgress
                        ? readingProgress.lastPage
                        : 1
                    )
                  }
                  className="px-2.5 py-1 text-[11px] font-semibold bg-violet-600 hover:bg-violet-500 text-white rounded transition-colors whitespace-nowrap shrink-0 tabular-nums cursor-pointer"
                >
                  Read Ch. {hoveredMapItem.chapterNumber}
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Chapter List & Batch Selection */}
      <section
        aria-label="Series Chapter List and Batch Downloader"
        className="studio-panel bg-[#11121A] border border-white/[0.07] rounded-xl p-5 space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ListChecks className="w-5 h-5 text-violet-400" />
            <h2 className="text-base sm:text-lg font-bold text-white font-display">
              Chapters ({filteredChapters.length})
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                aria-label="Filter chapters by title or number"
                value={chapterQuery}
                onChange={(e) => setChapterQuery(e.target.value)}
                placeholder="Search chapter..."
                className="w-44 sm:w-52 pl-8 pr-3 py-1.5 text-xs studio-subpanel bg-[#090A0F] border border-white/[0.07] rounded-lg text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-violet-500"
              />
            </div>

            {/* Sort by Custom Dropdown UI ('Newest First', 'Oldest First', 'Unread First') */}
            <DropdownMenu<ChapterSortOrder>
              id="series-chapter-sort-select"
              label="Sort by"
              ariaLabel="Sort by"
              icon={<ArrowUpDown className="w-3.5 h-3.5" />}
              value={chapterSortOrder}
              options={CHAPTER_SORT_OPTIONS.map((opt) => ({
                value: opt.id,
                label: opt.label,
                description: opt.description,
              }))}
              align="right"
              menuWidthClass="w-60"
              onChange={(val) => setChapterSortOrder(val)}
            />
          </div>
        </div>

        {/* Sleek Batch Selection Bar with Quick-Select Custom Dropdown UI */}
        <div
          className="studio-subpanel bg-[#090A0F] border border-white/[0.07] rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3"
          aria-label="Bulk chapter selection tool"
        >
          <div className="flex flex-wrap items-center gap-2.5">
            <DropdownMenu<string>
              id="batch-select-preset-dropdown"
              label="Batch Select"
              placeholder="Choose selection preset..."
              ariaLabel="Batch selection preset"
              value=""
              options={[
                {
                  value: 'all',
                  label:
                    filteredChapters.length > 0 &&
                    filteredChapters.every((c) => selectedChapterIds.has(c.id))
                      ? 'Deselect All'
                      : `Select All (${filteredChapters.length})`,
                  description: 'Toggle selection of all visible chapters',
                },
                {
                  value: 'unread',
                  label: `Select Unread / New (${newChaptersResolution.chapterIds.length})`,
                  description: newChaptersResolution.reason,
                },
                {
                  value: 'missing',
                  label: `Select Missing (${progressionMap.missingCount})`,
                  description: 'Chapters not yet in download queue',
                },
                {
                  value: 'invert',
                  label: 'Invert Current Selection',
                  description: 'Flip checked state of listed chapters',
                },
                {
                  value: 'clear',
                  label: `Clear Selection (${selectedChapterIds.size})`,
                  description: 'Uncheck all selected chapters',
                },
              ]}
              menuWidthClass="w-64"
              onChange={(val) => {
                if (val === 'all') handleSelectAll();
                else if (val === 'unread') handleSelectAllNew();
                else if (val === 'missing') handleSelectUnqueuedOnly();
                else if (val === 'invert') handleInvertSelection();
                else if (val === 'clear') {
                  setSelectedChapterIds(new Set());
                  setSelectionModeNote('Cleared chapter selection');
                }
              }}
            />

            {selectedChapterIds.size > 0 && (
              <button
                type="button"
                onClick={() => {
                  setSelectedChapterIds(new Set());
                  setSelectionModeNote('Cleared chapter selection');
                }}
                className="px-2.5 py-1.5 text-xs font-medium text-slate-400 hover:text-rose-300 bg-slate-900/60 hover:bg-rose-950/30 rounded-lg border border-white/[0.07] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Clear ({selectedChapterIds.size})
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
            <span className="text-slate-400 tabular-nums">
              {selectionStats.selectedCount} selected ({selectionStats.totalPages}p)
            </span>

            <button
              type="button"
              onClick={handleBatchDownload}
              disabled={selectedChapterIds.size === 0 || isBatchDownloading}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-semibold font-sans rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="tabular-nums">
                {isBatchDownloading
                  ? `Queueing (${selectedChapterIds.size})...`
                  : `Download Selected (${selectedChapterIds.size})`}
              </span>
            </button>
          </div>
        </div>

        {/* Chapter List Table */}
        <div className="border border-white/[0.07] rounded-xl overflow-hidden bg-[#090A0F]">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/[0.07] text-[11px] font-mono text-slate-400 bg-slate-900/50">
                <th className="py-3 px-4 w-10">SEL</th>
                <th className="py-2.5 px-4 w-40">
                  <button
                    type="button"
                    onClick={toggleSortAscDirection}
                    aria-label={
                      sortAsc
                        ? 'Sort chapters descending (latest chapter first)'
                        : 'Sort chapters ascending (1st chapter first)'
                    }
                    className="inline-flex items-center gap-1.5 text-slate-200 hover:text-violet-300 font-semibold transition-colors cursor-pointer"
                  >
                    <span>CHAPTER</span>
                    {sortAsc ? (
                      <ArrowUp className="w-3 h-3 text-violet-400" />
                    ) : (
                      <ArrowDown className="w-3 h-3 text-violet-400" />
                    )}
                  </button>
                </th>
                <th className="py-3 px-4">TITLE</th>
                <th className="py-3 px-4 hidden sm:table-cell">SCANLATION GROUP</th>
                <th className="py-3 px-4 hidden md:table-cell text-right">PAGES</th>
                <th className="py-3 px-4 hidden md:table-cell text-right">
                  <button
                    type="button"
                    onClick={toggleSortAscDirection}
                    className="inline-flex items-center justify-end gap-1 hover:text-slate-200 transition-colors cursor-pointer ml-auto"
                    title="Tap to toggle release order (Oldest first vs Newest first)"
                  >
                    <span>RELEASED</span>
                    {sortAsc ? (
                      <ArrowUp className="w-3 h-3 text-violet-400" />
                    ) : (
                      <ArrowDown className="w-3 h-3 text-violet-400" />
                    )}
                  </button>
                </th>
                <th className="py-3 px-4 text-right">ACTIONS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-xs">
              {filteredChapters.slice(0, visibleChapterLimit).map((ch) => {
                const isChecked = selectedChapterIds.has(ch.id);
                const isDownloadingThis = downloadingIds.has(ch.id);
                const isLastRead =
                  readingProgress !== null &&
                  (readingProgress.chapterId === ch.id ||
                    readingProgress.chapterNumber === ch.number);
                const isNewChapter = newChapterIdSet.has(ch.id);
                const isAlreadyQueued = queuedChapterNumberSet.has(ch.number);
                const isSavedReadLater = isChapterInReadLaterQueue(
                  readLaterQueue,
                  series.id,
                  ch
                );

                return (
                  <tr
                    key={ch.id}
                    className={`transition-colors ${
                      isLastRead
                        ? 'bg-amber-950/20 hover:bg-amber-950/30'
                        : isChecked
                        ? 'bg-violet-950/20 hover:bg-violet-950/30'
                        : 'hover:bg-slate-900/60'
                    }`}
                  >
                    <td className="py-3 px-4">
                      <button
                        type="button"
                        onClick={(e) => toggleChapter(ch.id, e.shiftKey)}
                        aria-label={`Select Chapter ${ch.number}`}
                        className="text-slate-400 hover:text-violet-400 cursor-pointer"
                      >
                        {isChecked ? (
                          <CheckSquare className="w-4 h-4 text-violet-400" />
                        ) : (
                          <Square className="w-4 h-4" />
                        )}
                      </button>
                    </td>

                    <td className="py-3 px-4 font-mono tabular-nums font-semibold text-slate-200">
                      <button
                        type="button"
                        onClick={() =>
                          onReadChapter(
                            seriesWithLiveChapters,
                            ch,
                            selectedReadingMode,
                            isLastRead && readingProgress ? readingProgress.lastPage : 1
                          )
                        }
                        className="flex items-center gap-1.5 text-left hover:text-violet-400 transition-colors cursor-pointer"
                      >
                        <span
                          title={
                            progressionItemById.get(ch.id)?.statusLabel ||
                            (isAlreadyQueued ? 'Downloaded in Library' : 'Missing in Library')
                          }
                          className={`w-2 h-2 rounded-full shrink-0 ${
                            isLastRead
                              ? 'bg-amber-400 ring-2 ring-amber-400/40'
                              : progressionItemById.get(ch.id)?.isRead && isAlreadyQueued
                              ? 'bg-teal-400'
                              : progressionItemById.get(ch.id)?.isRead
                              ? 'bg-amber-400'
                              : isAlreadyQueued
                              ? 'bg-emerald-400'
                              : 'bg-slate-700'
                          }`}
                        />
                        <span>Ch. {String(ch.number).padStart(3, '0')}</span>
                        {isNewChapter && (
                          <span className="text-[10px] font-mono font-bold text-violet-400">
                            NEW
                          </span>
                        )}
                        {isAlreadyQueued ? (
                          <span className="text-[10px] font-mono text-emerald-400">
                            DOWNLOADED
                          </span>
                        ) : (
                          <span className="text-[10px] font-mono text-slate-500">
                            MISSING
                          </span>
                        )}
                      </button>
                    </td>

                    <td className="py-3 px-4 text-slate-200 font-medium">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            onReadChapter(
                              seriesWithLiveChapters,
                              ch,
                              selectedReadingMode,
                              isLastRead && readingProgress ? readingProgress.lastPage : 1
                            )
                          }
                          className="text-left hover:text-violet-400 transition-colors cursor-pointer"
                        >
                          {ch.title}
                        </button>
                        {isLastRead && readingProgress && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-mono text-amber-400">
                            <History className="w-3 h-3" />
                            Last read · P. {readingProgress.lastPage}/
                            {readingProgress.totalPages} (
                            {formatRelativeReadTime(readingProgress.updatedAt)})
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="py-3 px-4 hidden sm:table-cell text-slate-400">
                      {ch.scanlationGroup}
                    </td>

                    <td className="py-3 px-4 hidden md:table-cell text-right font-mono tabular-nums text-slate-400">
                      {ch.pagesCount}p
                    </td>

                    <td className="py-3 px-4 hidden md:table-cell text-right font-mono tabular-nums text-slate-400">
                      {ch.releaseDate}
                    </td>

                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            onReadChapter(
                              seriesWithLiveChapters,
                              ch,
                              selectedReadingMode,
                              isLastRead && readingProgress ? readingProgress.lastPage : 1
                            )
                          }
                          className={`px-3 py-1 text-xs font-semibold rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                            isLastRead
                              ? 'bg-amber-500 text-slate-950 hover:bg-amber-400'
                              : 'bg-violet-600/25 text-violet-200 hover:bg-violet-600 hover:text-white'
                          }`}
                        >
                          {isLastRead ? `Resume Ch. ${ch.number}` : `Read Ch. ${ch.number}`}
                        </button>

                        {onToggleReadLaterChapter && (
                          <button
                            type="button"
                            onClick={() =>
                              onToggleReadLaterChapter(
                                seriesWithLiveChapters,
                                ch,
                                activeSource
                              )
                            }
                            aria-pressed={isSavedReadLater}
                            aria-label={
                              isSavedReadLater
                                ? `Remove Chapter ${ch.number} from Read Later`
                                : `Add Chapter ${ch.number} to Read Later`
                            }
                            title={
                              isSavedReadLater
                                ? `Ch. ${ch.number} is in Read Later queue`
                                : `Add Ch. ${ch.number} to Read Later queue`
                            }
                            className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                              isSavedReadLater
                                ? 'bg-amber-500/20 text-amber-200 border-amber-500/60'
                                : 'bg-[#090A0F] text-slate-300 hover:text-white border-white/[0.07] hover:border-amber-500/40'
                            }`}
                          >
                            <Clock className="w-3 h-3 text-amber-400" />
                            <span>{isSavedReadLater ? 'In Read Later' : 'Read Later'}</span>
                          </button>
                        )}

                        <button
                          type="button"
                          disabled={isDownloadingThis}
                          onClick={() => handleSingleChapterDownload(ch)}
                          aria-label={`Download Chapter ${ch.number} as ${archiveFormat}`}
                          className="flex items-center gap-1 px-2.5 py-1 text-xs font-mono text-emerald-300 hover:text-white bg-emerald-950/60 hover:bg-emerald-600/40 border border-emerald-800/50 rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <Download className="w-3 h-3" />
                          <span>
                            {isDownloadingThis ? 'Saving...' : archiveFormat}
                          </span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filteredChapters.length > visibleChapterLimit && (
            <div className="p-3.5 border-t border-white/[0.07] bg-slate-900/40 flex flex-wrap items-center justify-between gap-3 text-xs">
              <span className="font-mono text-slate-400 tabular-nums">
                Showing {Math.min(visibleChapterLimit, filteredChapters.length)} of{' '}
                {filteredChapters.length} chapters (all {filteredChapters.length} chapters remain selectable for batch download)
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setVisibleChapterLimit((prev) => prev + 120)}
                  className="px-3 py-1.5 font-semibold bg-violet-600 hover:bg-violet-500 text-white rounded-lg transition-colors cursor-pointer"
                >
                  Load Next 120 Chapters
                </button>
                <button
                  type="button"
                  onClick={() => setVisibleChapterLimit(filteredChapters.length)}
                  className="px-3 py-1.5 font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-white/[0.1] rounded-lg transition-colors cursor-pointer"
                >
                  Show All ({filteredChapters.length})
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Related Series / More Titles Strip */}
      {relatedSeries.length > 0 && onSelectSeries && (
        <section
          aria-label="More Series Like This"
          className="bg-[#11121A] border border-white/[0.07] rounded-xl p-6 space-y-4"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-white font-display">
              More Manga &amp; Manhwa in Live Directory
            </h2>
            <button
              type="button"
              onClick={onBack}
              className="text-xs font-mono text-violet-400 hover:text-violet-300 cursor-pointer"
            >
              View All Titles →
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {relatedSeries.map((rel) => (
              <div
                key={rel.id}
                onClick={() => {
                  onSelectSeries(rel);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectSeries(rel);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }
                }}
                className="bg-[#090A0F] border border-white/[0.07] hover:border-violet-500/60 rounded-xl p-3 flex items-center gap-3 cursor-pointer transition-colors"
              >
                <div className="w-14 aspect-[3/4] rounded-lg overflow-hidden border border-white/[0.07] shrink-0">
                  <MangaCoverArt series={rel} className="w-full h-full" />
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="text-sm font-bold text-white font-display truncate">
                    {rel.title}
                  </div>
                  <div className="text-xs text-slate-400 truncate">
                    {rel.author} · {rel.status}
                  </div>
                  <div className="text-[11px] font-mono text-violet-400 tabular-nums flex items-center gap-1">
                    <span>{rel.totalChapters} Chapters</span>
                    <span aria-hidden="true">·</span>
                    <Star className="w-3 h-3 text-amber-400 fill-amber-400 shrink-0" />
                    <span className="text-amber-400">{rel.rating.toFixed(1)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
