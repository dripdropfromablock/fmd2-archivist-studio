import React, { useState, useMemo, useEffect } from 'react';
import {
  BookOpen,
  Download,
  CheckSquare,
  Square,
  Search,
  Bookmark,
  X,
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
} from 'lucide-react';
import {
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
  CHAPTER_SORT_OPTIONS,
  sortSeriesChapters,
  resolveResumeChapter,
  formatRelativeReadTime,
  computeReadingSyncDurationMs,
  formatReadingSyncTime,
  type MangaSeries,
  type MangaChapter,
  type SourceId,
  type ArchiveFormat,
  type ReadingMode,
  type FmdEngineConfig,
  type ReadingSessionProgress,
  type DownloadTask,
  type ChapterSortOrder,
} from '../utils/fmdLogic.ts';
import { MangaCoverArt } from './MangaArtRenderer.tsx';
import { DropdownMenu, type DropdownMenuItem } from './DropdownMenu.tsx';

interface MangaDetailModalProps {
  series: MangaSeries;
  enabledSources?: SourceId[];
  engineConfig?: FmdEngineConfig;
  onUpdateEngineConfig?: (partial: Partial<FmdEngineConfig>) => void;
  readingProgress?: ReadingSessionProgress | null;
  onResumeReading?: (series: MangaSeries, progress: ReadingSessionProgress) => void;
  existingTasks?: DownloadTask[];
  isBookmarked: boolean;
  onToggleBookmark: (mangaId: string) => void;
  onClose: () => void;
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
}

export const MangaDetailModal: React.FC<MangaDetailModalProps> = ({
  series,
  enabledSources = DEFAULT_ENABLED_SOURCE_IDS,
  engineConfig,
  onUpdateEngineConfig,
  readingProgress = null,
  onResumeReading,
  existingTasks = [],
  isBookmarked,
  onToggleBookmark,
  onClose,
  onReadChapter,
  onQueueChapters,
  onOpenDownloadsTab,
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
  const [archiveFormat, setArchiveFormat] = useState<ArchiveFormat>('CBZ');
  const [selectedReadingMode, setSelectedReadingMode] = useState<ReadingMode>(
    () => modeResolution.mode
  );

  useEffect(() => {
    setSelectedReadingMode(modeResolution.mode);
  }, [series.id, modeResolution.mode]);
  const [chapterQuery, setChapterQuery] = useState('');
  const [rangeInput, setRangeInput] = useState('');
  const [rangeStartInput, setRangeStartInput] = useState<string>('1');
  const [rangeEndInput, setRangeEndInput] = useState<string>(() => {
    const nums = series.chapters.map((c) => c.number);
    return nums.length > 0 ? String(Math.max(...nums)) : '1';
  });
  const [selectionModeNote, setSelectionModeNote] = useState<string | null>(null);
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
    () => FMD2_SOURCE_MODULES.find((m) => m.id === activeSource) || FMD2_SOURCE_MODULES[0],
    [activeSource]
  );

  // Fetch real live chapter list from FMD2 scraper (/api/manga/chapters) when series or source changes
  useEffect(() => {
    let isMounted = true;
    setLoadingLiveChapters(true);

    const fetchLiveChapters = async () => {
      try {
        const res = await fetch(
          `/api/manga/chapters?title=${encodeURIComponent(series.title)}&sourceId=${encodeURIComponent(
            activeSource
          )}&seriesId=${encodeURIComponent(series.id)}&slug=${encodeURIComponent(series.slug)}`
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
        // Keep static series.chapters fallback
      } finally {
        if (isMounted) setLoadingLiveChapters(false);
      }
    };

    fetchLiveChapters();
    return () => {
      isMounted = false;
    };
  }, [series.id, series.title, activeSource]);

  const availableChapterNumbers = useMemo(
    () => liveChapters.map((c) => c.number).sort((a, b) => a - b),
    [liveChapters]
  );

  const minChapterNum = availableChapterNumbers[0] ?? 1;
  const maxChapterNum = availableChapterNumbers[availableChapterNumbers.length - 1] ?? 1;

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

  const filteredChapters = useMemo(() => {
    const q = chapterQuery.trim().toLowerCase();
    const list = liveChapters.filter((ch) => {
      if (!q) return true;
      return (
        String(ch.number).includes(q) ||
        ch.title.toLowerCase().includes(q) ||
        ch.scanlationGroup.toLowerCase().includes(q)
      );
    });
    return sortSeriesChapters(list, chapterSortOrder, readingProgress);
  }, [liveChapters, chapterQuery, chapterSortOrder, readingProgress]);

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
      `Selected ${ids.length} unread chapter${ids.length === 1 ? '' : 's'} after Ch. ${
        readingProgress.chapterNumber
      }`
    );
  };

  const handleSelectUnqueuedOnly = () => {
    const ids = newChaptersResolution.undownloadedIds;
    setSelectedChapterIds(new Set(ids));
    setSelectionModeNote(
      `Selected ${ids.length} chapter${ids.length === 1 ? '' : 's'} not yet in download queue`
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
          `Packed & downloaded ${chosen.length} chapter${chosen.length > 1 ? 's' : ''} (${archiveFormat}) via ${sourceModule.luaModule}`
        );
      }
    } finally {
      setIsBatchDownloading(false);
    }
  };

  const handleBatchDownloadAllMissing = async () => {
    if (missingChapters.length === 0 || isBatchDownloading) return;
    const missingIds = missingChapters.map((c) => c.id);
    setSelectedChapterIds(new Set(missingIds));
    setSelectionModeNote(
      `Batch queued all ${missingChapters.length} missing chapter${
        missingChapters.length === 1 ? '' : 's'
      } to download queue`
    );
    setIsBatchDownloading(true);
    try {
      const result = await onQueueChapters(
        series,
        missingChapters,
        activeSource,
        archiveFormat
      );
      const files = result?.downloadedFiles || [];
      if (files.length > 0) {
        setQueueFeedback(
          `Added all ${missingChapters.length} missing chapter${
            missingChapters.length === 1 ? '' : 's'
          } to queue · Saved ${files.join(', ')} (${archiveFormat}) via ${sourceModule.luaModule}`
        );
      } else {
        setQueueFeedback(
          `Added all ${missingChapters.length} missing chapter${
            missingChapters.length === 1 ? '' : 's'
          } (${archiveFormat}) to download queue via ${sourceModule.luaModule}`
        );
      }
    } finally {
      setIsBatchDownloading(false);
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

  const firstChapter =
    liveChapters.find((c) => c.number === 1) || liveChapters[liveChapters.length - 1];
  const latestChapter = liveChapters[0];

  const seriesWithLiveChapters: MangaSeries = useMemo(
    () => ({
      ...series,
      chapters: liveChapters,
      totalChapters: Math.max(series.totalChapters, liveChapters.length),
    }),
    [series, liveChapters]
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 sm:p-6 overflow-y-auto animate-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="manga-detail-title"
    >
      <div className="relative w-full max-w-5xl bg-[#11121A] border border-white/[0.07] rounded-xl overflow-hidden shadow-2xl my-auto max-h-[90vh] flex flex-col animate-modal-panel">
        {/* Top Bar inside Modal */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06] bg-[#090A0F]">
          <div className="flex items-center gap-3 text-xs text-slate-400 font-mono">
            <span className="text-emerald-400 font-semibold">FMD2 CONNECTED</span>
            <span aria-hidden="true">·</span>
            <span>{sourceModule.luaModule}</span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">{sourceModule.avgResponseMs}ms ping</span>
            {loadingLiveChapters && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-violet-400 inline-flex items-center gap-1">
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  Syncing chapters...
                </span>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close manga inspector"
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 overflow-y-auto space-y-8 flex-1">
          {/* Top Split: Cover + Metadata & Source Controls */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
            <div className="md:col-span-3">
              <div className="aspect-[3/4] rounded-lg overflow-hidden border border-white/[0.07]">
                <MangaCoverArt series={series} className="w-full h-full" />
              </div>
            </div>

            <div className="md:col-span-9 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2
                    id="manga-detail-title"
                    className="text-2xl sm:text-3xl font-bold tracking-tight text-white font-display"
                  >
                    {series.title}
                  </h2>
                  {/* Zero-Pill Metadata Line */}
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 mt-1.5">
                    <span className="text-slate-200 font-medium">{series.author}</span>
                    <span aria-hidden="true">·</span>
                    <span>{series.demographic}</span>
                    <span aria-hidden="true">·</span>
                    <span>{series.status}</span>
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums">{series.year}</span>
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums text-amber-400 font-mono">
                      {series.rating.toFixed(1)} / 10
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{series.genres.join(' / ')}</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onToggleBookmark(series.id)}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap shrink-0 ${
                    isBookmarked
                      ? 'bg-violet-500/15 border-violet-500/50 text-violet-300'
                      : 'bg-slate-900 border-white/[0.07] text-slate-300 hover:border-white/[0.1]'
                  }`}
                >
                  <Bookmark className="w-3.5 h-3.5" />
                  <span>{isBookmarked ? 'Saved in Library' : 'Save to Library'}</span>
                </button>
              </div>

              <p className="text-sm text-slate-300 leading-relaxed max-w-3xl">
                {series.synopsis}
              </p>

              {/* Source Connector Selector & Format Bar */}
              <div className="pt-2 grid grid-cols-1 lg:grid-cols-2 gap-4 border-t border-white/[0.06]">
                <div>
                  <label className="block text-xs text-slate-400 mb-2">
                    Active FMD2 Source Connector
                  </label>
                  <div className="flex flex-wrap items-center gap-1.5 p-1 bg-[#090A0F] border border-white/[0.07] rounded-lg">
                    {displaySources.map((srcId) => {
                      const mod = FMD2_SOURCE_MODULES.find((m) => m.id === srcId);
                      if (!mod) return null;
                      const isActive = activeSource === srcId;
                      return (
                        <button
                          key={srcId}
                          type="button"
                          onClick={() => setActiveSource(srcId)}
                          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                            isActive
                              ? 'bg-violet-600 text-white'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {mod.name}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-2">
                    FMD2 Export Container Format
                  </label>
                  <div className="flex items-center gap-1.5 p-1 bg-[#090A0F] border border-white/[0.07] rounded-lg">
                    {(['CBZ', 'ZIP'] as ArchiveFormat[]).map((fmt) => (
                      <button
                        key={fmt}
                        type="button"
                        onClick={() => setArchiveFormat(fmt)}
                        className={`px-3 py-1.5 text-xs font-mono font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                          archiveFormat === fmt
                            ? 'bg-slate-800 text-white border border-white/[0.1]'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {fmt}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="lg:col-span-2 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="block text-xs text-slate-400">
                      Reader Layout Mode ({modeResolution.reasonSummary})
                    </label>
                    {onUpdateEngineConfig && (
                      <button
                        type="button"
                        role="switch"
                        aria-checked={engineConfig?.autoDetectReadingMode !== false}
                        onClick={() =>
                          onUpdateEngineConfig({
                            autoDetectReadingMode: !(
                              engineConfig?.autoDetectReadingMode !== false
                            ),
                          })
                        }
                        className={`px-2.5 py-1 text-[11px] font-mono rounded border transition-colors whitespace-nowrap shrink-0 ${
                          engineConfig?.autoDetectReadingMode !== false
                            ? 'bg-violet-950/60 border-violet-500/60 text-violet-300'
                            : 'bg-[#090A0F] border-white/[0.07] text-slate-400'
                        }`}
                      >
                        Auto-Toggle by Genre/Tags:{' '}
                        {engineConfig?.autoDetectReadingMode !== false ? 'ON' : 'OFF'}
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 p-1 bg-[#090A0F] border border-white/[0.07] rounded-lg">
                    {READING_MODES_META.map((mode) => (
                      <button
                        key={mode.id}
                        type="button"
                        onClick={() => setSelectedReadingMode(mode.id)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                          selectedReadingMode === mode.id
                            ? 'bg-violet-600 text-white'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {mode.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Primary Action Row */}
              <div className="flex flex-wrap items-center gap-3 pt-2">
                {readingProgress && (
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
                    className="flex items-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Play className="w-4 h-4 fill-slate-950" />
                    <span>
                      Resume Ch. {readingProgress.chapterNumber}
                      {readingProgress.lastPage > 1
                        ? ` · P. ${readingProgress.lastPage}/${readingProgress.totalPages}`
                        : ''}
                    </span>
                  </button>
                )}
                {firstChapter && (
                  <button
                    type="button"
                    onClick={() =>
                      onReadChapter(seriesWithLiveChapters, firstChapter, selectedReadingMode)
                    }
                    className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0"
                  >
                    <BookOpen className="w-4 h-4" />
                    <span>Read Ch. {firstChapter.number} Now</span>
                  </button>
                )}
                {latestChapter && (
                  <button
                    type="button"
                    onClick={() =>
                      onReadChapter(seriesWithLiveChapters, latestChapter, selectedReadingMode)
                    }
                    className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-medium rounded-lg border border-white/[0.1] transition-colors whitespace-nowrap shrink-0"
                  >
                    <BookOpen className="w-4 h-4" />
                    <span>Read Latest (Ch. {latestChapter.number})</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleBatchDownload}
                  disabled={selectedChapterIds.size === 0 || isBatchDownloading}
                  className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span className="tabular-nums">
                    {isBatchDownloading
                      ? `Packing & Downloading (${selectedChapterIds.size})...`
                      : `Download Selected (${selectedChapterIds.size}) as ${archiveFormat}`}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={handleBatchDownloadAllMissing}
                  disabled={missingChapters.length === 0 || isBatchDownloading}
                  title={
                    missingChapters.length > 0
                      ? `Queue all ${missingChapters.length} missing chapter${
                          missingChapters.length === 1 ? '' : 's'
                        } in this series not yet in the download queue`
                      : 'All chapters in this series are already in the download queue'
                  }
                  className="flex items-center gap-2 px-4 py-2.5 bg-teal-600 hover:bg-teal-500 disabled:opacity-40 text-white text-xs font-semibold rounded-lg border border-teal-500/40 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Layers className="w-4 h-4" />
                  <span className="tabular-nums">
                    {missingChapters.length > 0
                      ? `Download All Missing (${missingChapters.length})`
                      : 'Download All Missing (0 Missing · All Queued)'}
                  </span>
                </button>
              </div>

              {queueFeedback && (
                <div
                  role="status"
                  className="text-xs font-mono text-emerald-300 bg-emerald-950/60 border border-emerald-700/60 rounded-lg px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>{queueFeedback}</span>
                  </div>
                  {onOpenDownloadsTab && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenDownloadsTab();
                      }}
                      className="text-xs font-semibold text-white bg-emerald-700/60 hover:bg-emerald-600 px-2.5 py-1 rounded transition-colors whitespace-nowrap shrink-0"
                    >
                      Open Downloads Queue →
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Bulk Chapter Selection Tool & Chapter Table Section */}
          <div className="space-y-4 border-t border-white/[0.07] pt-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold text-white flex items-center gap-2">
                  <ListChecks className="w-4 h-4 text-violet-400" />
                  <span>
                    Bulk Chapter Selector & Inspector ({filteredChapters.length} loaded via{' '}
                    {sourceModule.name})
                  </span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Select specific chapter ranges, one-click select all new/unread chapters, or Shift+Click checkboxes to batch queue {archiveFormat} archives.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Chapter Search */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    aria-label="Filter chapters by title or number"
                    value={chapterQuery}
                    onChange={(e) => setChapterQuery(e.target.value)}
                    placeholder="Filter chapters..."
                    className="w-44 pl-8 pr-3 py-1.5 text-xs bg-[#090A0F] border border-white/[0.07] rounded-lg text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-violet-500"
                  />
                </div>

                <DropdownMenu<ChapterSortOrder>
                  id="modal-chapter-sort-select"
                  label="Sort by"
                  ariaLabel="Sort by"
                  value={chapterSortOrder}
                  options={CHAPTER_SORT_OPTIONS.map((opt) => ({
                    value: opt.id,
                    label: opt.label,
                  }))}
                  onChange={(val) => setChapterSortOrder(val)}
                  icon={<ArrowUpDown className="w-3.5 h-3.5 text-violet-400" />}
                  align="right"
                  menuWidthClass="w-56"
                />
              </div>
            </div>

            {/* Dedicated FMD2 Bulk Chapter Selection Workbench */}
            <div
              className="bg-[#090A0F] border border-white/[0.07] rounded-xl p-4 space-y-3.5"
              aria-label="Bulk chapter selection tool"
            >
              {/* Row 1: Smart Preset Buttons ("All New", "Unread > Ch. X", "Unqueued", "Invert", "All / Clear") */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400 mr-1">
                    Quick Select:
                  </span>

                  <button
                    type="button"
                    onClick={handleSelectAllNew}
                    disabled={newChaptersResolution.chapterIds.length === 0}
                    title={newChaptersResolution.reason}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span className="tabular-nums">
                      Select All New ({newChaptersResolution.chapterIds.length})
                    </span>
                  </button>

                  {readingProgress && (
                    <button
                      type="button"
                      onClick={handleSelectUnreadAfterProgress}
                      disabled={newChaptersResolution.unreadIds.length === 0}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 disabled:opacity-40 text-amber-300 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <History className="w-3.5 h-3.5" />
                      <span className="tabular-nums">
                        Unread &gt; Ch. {readingProgress.chapterNumber} (
                        {newChaptersResolution.unreadIds.length})
                      </span>
                    </button>
                  )}

                  {newChaptersResolution.queuedOrDownloadedNumbers.length > 0 && (
                    <button
                      type="button"
                      onClick={handleSelectUnqueuedOnly}
                      disabled={newChaptersResolution.undownloadedIds.length === 0}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-slate-900 hover:bg-slate-800 border border-white/[0.1] text-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Layers className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="tabular-nums">
                        Unqueued Only ({newChaptersResolution.undownloadedIds.length})
                      </span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleSelectAll}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-slate-900 hover:bg-slate-800 text-slate-200 rounded-lg border border-white/[0.07] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {filteredChapters.length > 0 &&
                    filteredChapters.every((c) => selectedChapterIds.has(c.id)) ? (
                      <CheckSquare className="w-3.5 h-3.5 text-violet-400" />
                    ) : (
                      <Square className="w-3.5 h-3.5 text-slate-500" />
                    )}
                    <span>
                      {filteredChapters.length > 0 &&
                      filteredChapters.every((c) => selectedChapterIds.has(c.id))
                        ? 'Deselect All'
                        : `Select All (${filteredChapters.length})`}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={handleInvertSelection}
                    className="px-2.5 py-1.5 text-xs font-medium bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-lg border border-white/[0.07] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Invert
                  </button>

                  {selectedChapterIds.size > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedChapterIds(new Set());
                        setSelectionModeNote('Cleared chapter selection');
                      }}
                      className="px-2.5 py-1.5 text-xs font-medium text-slate-400 hover:text-rose-300 bg-slate-900/60 hover:bg-rose-950/30 rounded-lg border border-white/[0.07] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Clear
                    </button>
                  )}
                </div>

                <div className="text-[11px] font-mono text-slate-400">
                  All New criteria: <span className="text-slate-300">{newChaptersResolution.reason}</span>
                </div>
              </div>

              {/* Row 2: Specific Range Bounds (From Ch. X To Ch. Y) + Custom Expression Selector */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 pt-3 border-t border-white/[0.06] items-center">
                {/* From / To Chapter Bounds Selector */}
                <div className="lg:col-span-6 flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-mono text-slate-400 whitespace-nowrap">
                    Chapter Range:
                  </span>
                  <div className="flex items-center gap-1.5">
                    <label htmlFor="bulk-range-from" className="text-xs text-slate-400 font-mono">
                      From
                    </label>
                    <input
                      id="bulk-range-from"
                      type="number"
                      min={minChapterNum}
                      max={maxChapterNum}
                      step="any"
                      value={rangeStartInput}
                      onChange={(e) => setRangeStartInput(e.target.value)}
                      aria-label="Start chapter number"
                      className="w-20 px-2.5 py-1.5 text-xs font-mono tabular-nums bg-[#11121A] border border-white/[0.07] rounded-lg text-white focus:outline-none focus:border-violet-500"
                    />
                    <label htmlFor="bulk-range-to" className="text-xs text-slate-400 font-mono">
                      To
                    </label>
                    <input
                      id="bulk-range-to"
                      type="number"
                      min={minChapterNum}
                      max={maxChapterNum}
                      step="any"
                      value={rangeEndInput}
                      onChange={(e) => setRangeEndInput(e.target.value)}
                      aria-label="End chapter number"
                      className="w-20 px-2.5 py-1.5 text-xs font-mono tabular-nums bg-[#11121A] border border-white/[0.07] rounded-lg text-white focus:outline-none focus:border-violet-500"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleApplyBoundsRange(false)}
                    className="px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-lg border border-white/[0.1] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Select Range
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApplyBoundsRange(true)}
                    title="Add this range to current selection without clearing"
                    className="px-2.5 py-1.5 text-xs font-mono font-medium bg-[#11121A] hover:bg-slate-800 text-violet-300 rounded-lg border border-white/[0.07] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    + Add
                  </button>
                </div>

                {/* Expression Range Input (e.g. 1-5, 8, 4+) */}
                <form
                  onSubmit={(e) => handleApplyRange(e, false)}
                  className="lg:col-span-6 flex flex-wrap items-center lg:justify-end gap-2"
                >
                  <label htmlFor="chapter-range-input" className="text-[11px] font-mono text-slate-400 whitespace-nowrap">
                    Expression:
                  </label>
                  <input
                    id="chapter-range-input"
                    type="text"
                    value={rangeInput}
                    onChange={(e) => setRangeInput(e.target.value)}
                    placeholder="e.g. 1-3, 5, 4+"
                    className="w-40 px-3 py-1.5 text-xs font-mono bg-[#11121A] border border-white/[0.07] rounded-lg text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-violet-500"
                  />
                  <button
                    type="submit"
                    className="px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-lg border border-white/[0.1] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Apply Expr
                  </button>
                  <button
                    type="button"
                    onClick={(e) => handleApplyRange(e, true)}
                    className="px-2.5 py-1.5 text-xs font-mono font-medium bg-[#11121A] hover:bg-slate-800 text-violet-300 rounded-lg border border-white/[0.07] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    + Add Expr
                  </button>
                </form>
              </div>

              {/* Row 3: Live Selection Summary & Batch Queue Action Bar */}
              <div className="pt-3 border-t border-white/[0.06] flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-slate-300">
                  <span className="text-violet-400 font-semibold tabular-nums">
                    {selectionStats.selectedCount} / {liveChapters.length} Selected
                  </span>
                  <span aria-hidden="true" className="text-slate-600">·</span>
                  <span className="text-slate-400 tabular-nums">{selectionStats.chapterRangeLabel}</span>
                  <span aria-hidden="true" className="text-slate-600">·</span>
                  <span className="text-slate-400 tabular-nums">{selectionStats.totalPages} pages</span>
                  <span aria-hidden="true" className="text-slate-600">·</span>
                  <span className="text-slate-400 tabular-nums">~{selectionStats.estimatedSizeMb} MB ({archiveFormat})</span>
                  {selectionModeNote && (
                    <>
                      <span aria-hidden="true" className="text-slate-600">·</span>
                      <span className="text-emerald-400">{selectionModeNote}</span>
                    </>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleBatchDownload}
                  disabled={selectedChapterIds.size === 0 || isBatchDownloading}
                  className="flex items-center gap-2 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span className="tabular-nums">
                    {isBatchDownloading
                      ? `Queueing & Packing (${selectedChapterIds.size})...`
                      : `Queue Selected (${selectedChapterIds.size}) to Batch Downloader`}
                  </span>
                </button>
              </div>
            </div>

            {/* High-Density Chapter Table */}
            <div className="border border-white/[0.07] rounded-lg overflow-hidden bg-[#090A0F]">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/[0.07] text-[11px] font-mono text-slate-400 bg-slate-900/50">
                    <th className="py-2.5 px-4 w-10">SEL</th>
                    <th className="py-2 px-4 w-40">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={toggleSortAscDirection}
                          aria-label={
                            sortAsc
                              ? 'Sort chapters descending (latest chapter first)'
                              : 'Sort chapters ascending (1st chapter first)'
                          }
                          title={
                            sortAsc
                              ? 'Currently Ascending (Ch. 1 first) — Tap to switch to Descending'
                              : 'Currently Descending (Latest first) — Tap to read from 1st chapter (Ascending)'
                          }
                          className="inline-flex items-center gap-1 text-slate-200 hover:text-violet-300 font-semibold transition-colors cursor-pointer"
                        >
                          <span>CHAPTER</span>
                          {sortAsc ? (
                            <ArrowUp className="w-3.5 h-3.5 text-violet-400" />
                          ) : (
                            <ArrowDown className="w-3.5 h-3.5 text-violet-400" />
                          )}
                        </button>
                        <div className="inline-flex items-center rounded border border-white/[0.07] bg-[#090A0F] p-0.5">
                          <button
                            type="button"
                            onClick={() => setChapterSortOrder('oldest-first')}
                            aria-label="Sort ascending from 1st chapter"
                            title="Sort Oldest First (Ch. 1 first)"
                            className={`p-0.5 rounded transition-colors cursor-pointer ${
                              chapterSortOrder === 'oldest-first'
                                ? 'bg-violet-600 text-white'
                                : 'text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            <ArrowUp className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setChapterSortOrder('newest-first')}
                            aria-label="Sort descending from latest chapter"
                            title="Sort Newest First (Latest first)"
                            className={`p-0.5 rounded transition-colors cursor-pointer ${
                              chapterSortOrder === 'newest-first'
                                ? 'bg-violet-600 text-white'
                                : 'text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            <ArrowDown className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </th>
                    <th className="py-2.5 px-4">CHAPTER TITLE</th>
                    <th className="py-2.5 px-4 hidden sm:table-cell">SCANLATION GROUP</th>
                    <th className="py-2.5 px-4 hidden md:table-cell text-right">PAGES</th>
                    <th className="py-2.5 px-4 hidden md:table-cell text-right">
                      <button
                        type="button"
                        onClick={toggleSortAscDirection}
                        className="inline-flex items-center justify-end gap-1 hover:text-slate-200 transition-colors cursor-pointer ml-auto"
                      >
                        <span>RELEASED</span>
                        {sortAsc ? (
                          <ArrowUp className="w-3 h-3 text-violet-400" />
                        ) : (
                          <ArrowDown className="w-3 h-3 text-violet-400" />
                        )}
                      </button>
                    </th>
                    <th className="py-2.5 px-4 text-right">ACTIONS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-xs">
                  {filteredChapters.map((ch) => {
                    const isChecked = selectedChapterIds.has(ch.id);
                    const isDownloadingThis = downloadingIds.has(ch.id);
                    const isLastRead =
                      readingProgress !== null &&
                      (readingProgress.chapterId === ch.id ||
                        readingProgress.chapterNumber === ch.number);
                    const isNewChapter = newChapterIdSet.has(ch.id);
                    const isAlreadyQueued = queuedChapterNumberSet.has(ch.number);
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
                        <td className="py-2.5 px-4">
                          <button
                            type="button"
                            onClick={(e) => toggleChapter(ch.id, e.shiftKey)}
                            aria-label={`Select Chapter ${ch.number}`}
                            title="Click to toggle · Shift+Click to select range"
                            className="text-slate-400 hover:text-violet-400 cursor-pointer"
                          >
                            {isChecked ? (
                              <CheckSquare className="w-4 h-4 text-violet-400" />
                            ) : (
                              <Square className="w-4 h-4" />
                            )}
                          </button>
                        </td>
                        <td className="py-2.5 px-4 font-mono tabular-nums font-semibold text-slate-200">
                          <div className="flex items-center gap-1.5">
                            <span>Ch. {String(ch.number).padStart(3, '0')}</span>
                            {isNewChapter && (
                              <span
                                className="text-[10px] font-mono font-bold text-violet-400"
                                title={newChaptersResolution.reason}
                              >
                                NEW
                              </span>
                            )}
                            {isAlreadyQueued && (
                              <span
                                className="text-[10px] font-mono text-emerald-400"
                                title="Already in FMD2 download queue"
                              >
                                QUEUED
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 px-4 text-slate-200 font-medium">
                          <div className="flex flex-wrap items-center gap-2">
                            <span>{ch.title}</span>
                            {isLastRead && readingProgress && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-mono text-amber-400">
                                <History className="w-3 h-3" />
                                Last read · P. {readingProgress.lastPage}/{readingProgress.totalPages} (
                                {formatRelativeReadTime(readingProgress.updatedAt)}) ·{' '}
                                <span className="text-emerald-400">
                                  Sync Time:{' '}
                                  {formatReadingSyncTime(computeReadingSyncDurationMs(readingProgress))}
                                </span>
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 px-4 hidden sm:table-cell text-slate-400">
                          {ch.scanlationGroup}
                        </td>
                        <td className="py-2.5 px-4 hidden md:table-cell text-right font-mono tabular-nums text-slate-400">
                          {ch.pagesCount}p
                        </td>
                        <td className="py-2.5 px-4 hidden md:table-cell text-right font-mono tabular-nums text-slate-400">
                          {ch.releaseDate}
                        </td>
                        <td className="py-2.5 px-4 text-right">
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
                              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                                isLastRead
                                  ? 'bg-amber-500/20 text-amber-300 hover:bg-amber-500 hover:text-slate-950 font-semibold'
                                  : 'text-violet-300 hover:text-white hover:bg-violet-600/30'
                              }`}
                            >
                              {isLastRead ? 'Resume' : 'Read'}
                            </button>
                            <button
                              type="button"
                              disabled={isDownloadingThis}
                              onClick={() => handleSingleChapterDownload(ch)}
                              aria-label={`Download Chapter ${ch.number} as ${archiveFormat}`}
                              className="flex items-center gap-1 px-2.5 py-1 text-xs font-mono text-emerald-300 hover:text-white bg-emerald-950/60 hover:bg-emerald-600/40 border border-emerald-800/50 rounded transition-colors whitespace-nowrap shrink-0"
                            >
                              <Download className="w-3 h-3" />
                              <span>
                                {isDownloadingThis ? 'Saving...' : `Download ${archiveFormat}`}
                              </span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
