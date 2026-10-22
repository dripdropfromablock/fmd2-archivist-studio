import React, { useState, useMemo } from 'react';
import {
  Clock,
  BookOpen,
  Play,
  Download,
  Trash2,
  ArrowUp,
  ArrowDown,
  Search,
  Plus,
  Bookmark,
  Layers,
  CheckCircle2,
  ArrowRight,
  ListOrdered,
} from 'lucide-react';
import {
  ALL_FMD2_SOURCES,
  FMD2_SOURCE_MODULES,
  formatRelativeReadTime,
  getSeriesReadingProgress,
  type MangaSeries,
  type MangaChapter,
  type SourceId,
  type ArchiveFormat,
  type ReadLaterItem,
  type ReadingSessionProgress,
} from '../utils/fmdLogic.ts';
import { MangaCoverArt } from './MangaArtRenderer.tsx';
import { DropdownMenu, type DropdownMenuItem } from './DropdownMenu.tsx';

interface ReadLaterQueueViewProps {
  queue: ReadLaterItem[];
  catalog: MangaSeries[];
  bookmarkedIds: string[];
  readingHistory: Record<string, ReadingSessionProgress>;
  defaultFormat?: ArchiveFormat;
  onReadQueuedChapter: (item: ReadLaterItem, removeAfterOpen?: boolean) => void;
  onRemoveFromQueue: (itemId: string) => void;
  onMoveQueueItem: (itemId: string, direction: 'up' | 'down' | 'top') => void;
  onClearQueue: () => void;
  onAddChapterToQueue: (
    series: MangaSeries,
    chapter: MangaChapter,
    sourceId?: SourceId
  ) => void;
  onInspectSeries: (series: MangaSeries) => void;
  onDownloadQueuedItem: (item: ReadLaterItem) => Promise<void>;
  onDownloadAllQueued: () => Promise<void>;
  onOpenReaderTab: () => void;
  onOpenCatalogTab: () => void;
}

type ReadLaterSortMode = 'queue-order' | 'added-desc' | 'chapter-asc' | 'series-asc';

export const ReadLaterQueueView: React.FC<ReadLaterQueueViewProps> = ({
  queue,
  catalog,
  bookmarkedIds,
  readingHistory,
  defaultFormat = 'CBZ',
  onReadQueuedChapter,
  onRemoveFromQueue,
  onMoveQueueItem,
  onClearQueue,
  onAddChapterToQueue,
  onInspectSeries,
  onDownloadQueuedItem,
  onDownloadAllQueued,
  onOpenReaderTab,
  onOpenCatalogTab,
}) => {
  const [searchFilter, setSearchFilter] = useState('');
  const [sortMode, setSortMode] = useState<ReadLaterSortMode>('queue-order');
  const [quickSeriesId, setQuickSeriesId] = useState<string>(
    () => catalog[0]?.id || ''
  );
  const [quickChapterId, setQuickChapterId] = useState<string>(
    () => catalog[0]?.chapters[0]?.id || ''
  );
  const [downloadingItemId, setDownloadingItemId] = useState<string | null>(null);
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);
  const [actionToast, setActionToast] = useState<string | null>(null);

  const selectedQuickSeries = useMemo(
    () => catalog.find((s) => s.id === quickSeriesId) || catalog[0] || null,
    [catalog, quickSeriesId]
  );

  const quickChapters = useMemo(() => {
    if (!selectedQuickSeries) return [];
    return [...selectedQuickSeries.chapters].sort((a, b) => a.number - b.number);
  }, [selectedQuickSeries]);

  const quickSeriesDropdownItems = useMemo<DropdownMenuItem<string>[]>(
    () =>
      catalog.map((s) => ({
        value: s.id,
        label: s.title,
        description: `${s.author} · ${s.status}`,
        badge: `${s.totalChapters} ch`,
      })),
    [catalog]
  );

  const quickChapterDropdownItems = useMemo<DropdownMenuItem<string>[]>(
    () =>
      quickChapters.map((c) => ({
        value: c.id,
        label: `Ch. ${c.number} — ${c.title}`,
        description: `${c.scanlationGroup} · ${c.releaseDate}`,
        badge: `${c.pagesCount}p`,
      })),
    [quickChapters]
  );

  const sortOrderDropdownItems = useMemo<DropdownMenuItem<ReadLaterSortMode>[]>(
    () => [
      {
        value: 'queue-order',
        label: 'Queue Order',
        description: 'Manual up/down reading priority',
      },
      {
        value: 'added-desc',
        label: 'Recently Added',
        description: 'Most recently saved chapters first',
      },
      {
        value: 'chapter-asc',
        label: 'Chapter Ascending',
        description: 'Sort by series and chapter number',
      },
      {
        value: 'series-asc',
        label: 'Series Title (A–Z)',
        description: 'Alphabetical by manga title',
      },
    ],
    []
  );

  const seriesById = useMemo(() => {
    const map = new Map<string, MangaSeries>();
    for (const s of catalog) {
      map.set(s.id, s);
    }
    return map;
  }, [catalog]);

  const filteredAndSortedQueue = useMemo(() => {
    const q = searchFilter.trim().toLowerCase();
    const filtered = queue.filter((item) => {
      if (!q) return true;
      return (
        item.seriesTitle.toLowerCase().includes(q) ||
        item.chapterTitle.toLowerCase().includes(q) ||
        String(item.chapterNumber).includes(q) ||
        item.scanlationGroup.toLowerCase().includes(q)
      );
    });

    if (sortMode === 'queue-order') return filtered;
    const copy = [...filtered];
    if (sortMode === 'added-desc') {
      return copy.sort((a, b) => Date.parse(b.addedAt) - Date.parse(a.addedAt));
    }
    if (sortMode === 'chapter-asc') {
      return copy.sort((a, b) =>
        a.seriesTitle === b.seriesTitle
          ? a.chapterNumber - b.chapterNumber
          : a.seriesTitle.localeCompare(b.seriesTitle)
      );
    }
    return copy.sort((a, b) =>
      a.seriesTitle === b.seriesTitle
        ? a.chapterNumber - b.chapterNumber
        : a.seriesTitle.localeCompare(b.seriesTitle)
    );
  }, [queue, searchFilter, sortMode]);

  const queueStats = useMemo(() => {
    const seriesSet = new Set(queue.map((i) => i.seriesId));
    const totalPages = queue.reduce((sum, item) => sum + (item.pagesCount || 18), 0);
    const estMinutes = Math.max(1, Math.round(totalPages * 0.45));
    return {
      totalChapters: queue.length,
      uniqueSeries: seriesSet.size,
      totalPages,
      estMinutes,
    };
  }, [queue]);

  const handleQuickAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedQuickSeries) return;
    const targetChapter =
      quickChapters.find((c) => c.id === quickChapterId) || quickChapters[0];
    if (!targetChapter) return;
    onAddChapterToQueue(
      selectedQuickSeries,
      targetChapter,
      selectedQuickSeries.primarySource
    );
    setActionToast(
      `Added "${selectedQuickSeries.title} · Ch. ${targetChapter.number}" to Read Later queue`
    );
    setTimeout(() => setActionToast(null), 3500);
  };

  const handleDownloadSingle = async (item: ReadLaterItem) => {
    setDownloadingItemId(item.id);
    try {
      await onDownloadQueuedItem(item);
      setActionToast(
        `Queued "${item.seriesTitle} · Ch. ${item.chapterNumber}" (${defaultFormat}) in Downloads`
      );
      setTimeout(() => setActionToast(null), 3500);
    } finally {
      setDownloadingItemId(null);
    }
  };

  const handleDownloadAll = async () => {
    if (queue.length === 0 || isDownloadingAll) return;
    setIsDownloadingAll(true);
    try {
      await onDownloadAllQueued();
      setActionToast(
        `Queued all ${queue.length} Read Later chapter${
          queue.length === 1 ? '' : 's'
        } (${defaultFormat}) for archive download`
      );
      setTimeout(() => setActionToast(null), 3500);
    } finally {
      setIsDownloadingAll(false);
    }
  };

  return (
    <div className="space-y-6" data-testid="read-later-queue-view">
      {/* Header & Quick Add Panel */}
      <section className="studio-panel bg-[#11121A] border border-white/[0.07] rounded-xl p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white font-display">
              Read Later Queue ({queue.length})
            </h1>
            <p className="text-xs text-slate-400 max-w-2xl">
              Save specific chapters to read next, separate from your Saved Series bookmarks ({bookmarkedIds.length} bookmarked).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {queue.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => onReadQueuedChapter(queue[0], false)}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 fill-slate-950" />
                  <span>
                    Read Next: {queue[0].seriesTitle} Ch. {queue[0].chapterNumber}
                  </span>
                </button>
                <button
                  type="button"
                  disabled={isDownloadingAll}
                  onClick={() => void handleDownloadAll()}
                  className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>
                    {isDownloadingAll
                      ? `Queueing (${queue.length})...`
                      : `Download All (${queue.length})`}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={onClearQueue}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-[#090A0F] hover:bg-rose-950/60 text-slate-300 hover:text-rose-200 border border-white/[0.07] hover:border-rose-700/50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                  <span>Clear Queue</span>
                </button>
              </>
            )}
            <button
              type="button"
              onClick={onOpenReaderTab}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-violet-600 hover:bg-violet-500 text-white rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Open Manga Reader</span>
            </button>
          </div>
        </div>

        {/* Quick Add Specific Chapter to Read Later Form */}
        {catalog.length > 0 && (
          <form
            onSubmit={handleQuickAddSubmit}
            className="pt-3 border-t border-white/[0.06] flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3"
          >
            <div className="flex items-center gap-2 text-xs text-slate-300">
              <Plus className="w-4 h-4 text-amber-400 shrink-0" />
              <span className="font-semibold text-white">Add a Chapter to Queue:</span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <DropdownMenu<string>
                label="Series"
                ariaLabel="Select series to add to Read Later"
                value={selectedQuickSeries?.id || ''}
                options={quickSeriesDropdownItems}
                searchable
                searchPlaceholder="Find series..."
                menuWidthClass="w-72"
                onChange={(val) => {
                  const nextSeries = catalog.find((s) => s.id === val);
                  setQuickSeriesId(val);
                  if (nextSeries && nextSeries.chapters.length > 0) {
                    setQuickChapterId(nextSeries.chapters[0].id);
                  }
                }}
              />

              <DropdownMenu<string>
                label="Chapter"
                ariaLabel="Select chapter to add to Read Later"
                value={
                  quickChapters.some((c) => c.id === quickChapterId)
                    ? quickChapterId
                    : quickChapters[0]?.id || ''
                }
                options={quickChapterDropdownItems}
                searchable
                searchPlaceholder="Find chapter..."
                menuWidthClass="w-72"
                onChange={(val) => setQuickChapterId(val)}
              />

              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add to Read Later</span>
              </button>
            </div>
          </form>
        )}

        {actionToast && (
          <div
            role="status"
            className="text-xs font-mono text-emerald-200 bg-emerald-950/70 border border-emerald-700/60 rounded-lg px-4 py-2.5 flex items-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{actionToast}</span>
          </div>
        )}
      </section>

      {/* Queue Filter & Sort Toolbar + Chapter Queue List */}
      <section className="studio-panel bg-[#11121A] border border-white/[0.07] rounded-2xl p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              aria-label="Filter Read Later chapters"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Filter queued chapters by series, chapter number, or group..."
              className="w-full pl-10 pr-4 py-2 text-xs bg-[#090A0F] border border-white/[0.07] rounded-lg text-white placeholder:text-slate-500 focus:outline-none focus:border-violet-500"
            />
          </div>

          <DropdownMenu<ReadLaterSortMode>
            id="read-later-sort-select"
            label="Sort Order"
            ariaLabel="Sort Read Later queue"
            icon={<ListOrdered className="w-3.5 h-3.5" />}
            value={sortMode}
            options={sortOrderDropdownItems}
            align="right"
            menuWidthClass="w-64"
            onChange={(val) => setSortMode(val)}
          />
        </div>

        {filteredAndSortedQueue.length === 0 ? (
          <div className="bg-[#090A0F] border border-white/[0.07]/90 rounded-xl p-10 text-center space-y-3">
            <Clock className="w-8 h-8 text-amber-400 mx-auto" />
            <div className="text-base font-bold text-white font-display">
              {queue.length === 0
                ? 'Your Read Later Chapter Queue is Empty'
                : 'No Queued Chapters Match Your Filter'}
            </div>
            <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
              {queue.length === 0
                ? 'Use the "Read Later" button in the Manga Reader toolbar or on any Manga Series chapter row to save specific chapters to your reading list.'
                : 'Try clearing your search filter above to view all queued chapters.'}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
              <button
                type="button"
                onClick={onOpenReaderTab}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-violet-600 hover:bg-violet-500 text-white rounded-lg transition-colors cursor-pointer"
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>Go to Manga Reader</span>
              </button>
              <button
                type="button"
                onClick={onOpenCatalogTab}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-white/[0.1] transition-colors cursor-pointer"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Browse Sources</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3" role="list" aria-label="Read Later chapter items">
            {filteredAndSortedQueue.map((item, idx) => {
              const matchedSeries = seriesById.get(item.seriesId);
              const sourceMeta =
                ALL_FMD2_SOURCES.find((s) => s.id === item.sourceId) ||
                FMD2_SOURCE_MODULES.find((s) => s.id === item.sourceId);
              const seriesProgress = matchedSeries
                ? getSeriesReadingProgress(readingHistory, matchedSeries)
                : readingHistory[item.seriesId] || null;
              const isSameChapterInProgress =
                seriesProgress && seriesProgress.chapterNumber === item.chapterNumber;
              const isSeriesBookmarked = bookmarkedIds.includes(item.seriesId);

              return (
                <div
                  key={item.id}
                  role="listitem"
                  data-testid={`read-later-item-${item.seriesId}-${item.chapterNumber}`}
                  className="animate-card-enter queue-card-interactive p-4 rounded-xl bg-[#090A0F] border border-white/[0.07]/90 hover:border-white/[0.1] transition-all flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                  style={{ '--stagger-idx': idx } as React.CSSProperties}
                >
                  <div className="flex items-start sm:items-center gap-3.5 min-w-0">
                    {/* Queue Index & Reorder Controls */}
                    <div className="flex flex-col items-center gap-1 shrink-0">
                      <span className="text-xs font-mono font-bold text-amber-400 tabular-nums">
                        #{idx + 1}
                      </span>
                      {sortMode === 'queue-order' && filteredAndSortedQueue.length > 1 && (
                        <div className="flex items-center gap-0.5">
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => onMoveQueueItem(item.id, 'up')}
                            aria-label={`Move ${item.seriesTitle} Chapter ${item.chapterNumber} up`}
                            title="Move Up in Queue"
                            className="p-1 text-slate-400 hover:text-white disabled:opacity-30 rounded hover:bg-slate-800 cursor-pointer"
                          >
                            <ArrowUp className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === filteredAndSortedQueue.length - 1}
                            onClick={() => onMoveQueueItem(item.id, 'down')}
                            aria-label={`Move ${item.seriesTitle} Chapter ${item.chapterNumber} down`}
                            title="Move Down in Queue"
                            className="p-1 text-slate-400 hover:text-white disabled:opacity-30 rounded hover:bg-slate-800 cursor-pointer"
                          >
                            <ArrowDown className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Cover Thumbnail */}
                    {matchedSeries && (
                      <button
                        type="button"
                        onClick={() => onInspectSeries(matchedSeries)}
                        className="w-12 h-16 rounded-lg overflow-hidden border border-white/[0.07] shrink-0 cursor-pointer"
                        title={`Inspect ${matchedSeries.title}`}
                      >
                        <MangaCoverArt series={matchedSeries} className="w-full h-full" />
                      </button>
                    )}

                    {/* Series & Specific Chapter Details */}
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        {matchedSeries ? (
                          <button
                            type="button"
                            onClick={() => onInspectSeries(matchedSeries)}
                            className="text-sm font-bold text-white hover:text-violet-400 font-display truncate transition-colors cursor-pointer text-left"
                          >
                            {item.seriesTitle}
                          </button>
                        ) : (
                          <span className="text-sm font-bold text-white font-display truncate">
                            {item.seriesTitle}
                          </span>
                        )}

                        <span aria-hidden="true" className="text-slate-600">·</span>

                        <span className="font-mono font-semibold text-amber-400 tabular-nums">
                          Ch. {item.chapterNumber}
                        </span>

                        <span aria-hidden="true" className="text-slate-600">·</span>

                        <span className="font-mono text-violet-400">
                          {sourceMeta?.name || item.sourceId}
                        </span>

                        {isSeriesBookmarked && (
                          <>
                            <span aria-hidden="true" className="text-slate-600">·</span>
                            <span
                              title="This series is also in your Saved Library bookmarks"
                              className="inline-flex items-center gap-1 font-mono text-violet-300"
                            >
                              <Bookmark className="w-3 h-3 fill-violet-400 text-violet-400" />
                              <span>Bookmarked</span>
                            </span>
                          </>
                        )}
                      </div>

                      <div className="text-xs text-slate-200 font-medium truncate">
                        Chapter {item.chapterNumber}: {item.chapterTitle}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-slate-400 tabular-nums">
                        <span>{item.pagesCount} pages</span>
                        <span aria-hidden="true">·</span>
                        <span>{item.scanlationGroup}</span>
                        <span aria-hidden="true">·</span>
                        <span>Added {formatRelativeReadTime(item.addedAt)}</span>
                        {isSameChapterInProgress && seriesProgress && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-amber-300 font-semibold">
                              In Progress (Page {seriesProgress.lastPage}/
                              {seriesProgress.totalPages})
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => onReadQueuedChapter(item, false)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-violet-600 hover:bg-violet-500 text-white rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <BookOpen className="w-3.5 h-3.5" />
                      <span>
                        {isSameChapterInProgress && seriesProgress
                          ? `Resume P. ${seriesProgress.lastPage}`
                          : `Read Ch. ${item.chapterNumber}`}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onReadQueuedChapter(item, true)}
                      title="Open chapter in Manga Reader and remove it from Read Later queue"
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-amber-500/15 hover:bg-amber-500/25 text-amber-200 border border-amber-500/40 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <ArrowRight className="w-3.5 h-3.5 text-amber-400" />
                      <span>Read &amp; Pop</span>
                    </button>

                    <button
                      type="button"
                      disabled={downloadingItemId === item.id}
                      onClick={() => void handleDownloadSingle(item)}
                      title={`Download Ch. ${item.chapterNumber} as ${defaultFormat}`}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-emerald-950/60 hover:bg-emerald-900/70 text-emerald-200 border border-emerald-700/50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5 text-emerald-400" />
                      <span>
                        {downloadingItemId === item.id ? 'Saving...' : defaultFormat}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onRemoveFromQueue(item.id)}
                      aria-label={`Remove ${item.seriesTitle} Chapter ${item.chapterNumber} from Read Later`}
                      title="Remove from Read Later Queue"
                      className="p-2 text-slate-400 hover:text-rose-300 bg-slate-900 hover:bg-rose-950/50 border border-white/[0.07] hover:border-rose-700/50 rounded-lg transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
