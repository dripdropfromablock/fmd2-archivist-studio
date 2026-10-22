import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Download,
  ArrowLeft,
  Columns2,
  FileText,
  ScrollText,
  RefreshCw,
  GalleryHorizontal,
  GalleryVertical,
  MoveHorizontal,
  BookOpen,
  Settings,
  Play,
  Pause,
  Sun,
  Keyboard,
  RotateCcw,
  X,
  EyeOff,
  Eye,
  Maximize2,
  Minimize2,
  Clock,
  BookmarkPlus,
  Check,
} from 'lucide-react';
import {
  computeReaderPageGroups,
  getSpreadDisplayPages,
  resolveSeriesReadingMode,
  READING_MODES_META,
  READER_IMAGE_FIT_META,
  READER_CANVAS_THEMES_META,
  AUTO_SCROLL_SPEED_PRESETS,
  computeReaderOpticalFilterCss,
  FMD2_SOURCE_MODULES,
  isChapterInReadLaterQueue,
  type MangaSeries,
  type MangaChapter,
  type ReadingMode,
  type ReadingDirection,
  type ReaderImageFit,
  type ReaderCanvasTheme,
  type WebtoonStripWidth,
  type SourceId,
  type FmdEngineConfig,
  type ReadLaterItem,
} from '../utils/fmdLogic.ts';
import { DropdownMenu, type DropdownMenuItem } from './DropdownMenu.tsx';

interface MangaReaderViewProps {
  series: MangaSeries;
  chapter: MangaChapter;
  initialReadingMode?: ReadingMode | null;
  initialPageNumber?: number | null;
  allSeries?: MangaSeries[];
  engineConfig?: FmdEngineConfig;
  onUpdateEngineConfig?: (partial: Partial<FmdEngineConfig>) => void;
  onSelectChapter: (chapter: MangaChapter) => void;
  onSelectSeriesAndChapter?: (
    series: MangaSeries,
    chapter: MangaChapter,
    preferredMode?: ReadingMode
  ) => void;
  onUpdateReadingProgress?: (progress: {
    chapter: MangaChapter;
    lastPage: number;
    totalPages: number;
    sourceId: SourceId;
    readingMode: ReadingMode;
  }) => void;
  onExitReader: () => void;
  onOpenSeriesPage?: (series: MangaSeries) => void;
  onDownloadCurrentChapter: (
    series: MangaSeries,
    chapter: MangaChapter,
    sourceId: SourceId
  ) => Promise<{ downloadedFiles?: string[] } | void>;
  readLaterQueue?: ReadLaterItem[];
  onToggleReadLaterChapter?: (
    series: MangaSeries,
    chapter: MangaChapter,
    sourceId: SourceId
  ) => boolean | void;
  onOpenReadLaterTab?: () => void;
}

type ProgressBarPosition = 'left' | 'bottom' | 'right' | 'hidden';
type SettingsDrawerTab = 'layout' | 'display' | 'shortcuts';

const WEBTOON_WIDTH_OPTIONS: { id: WebtoonStripWidth; label: string }[] = [
  { id: '640px', label: 'Narrow (640px)' },
  { id: '800px', label: 'Standard (800px)' },
  { id: '1024px', label: 'Wide (1024px)' },
  { id: '100%', label: 'Full Width (100%)' },
];

const STRIP_MARGIN_PRESETS: { value: number; label: string }[] = [
  { value: 0, label: '0 (Default)' },
  { value: 4, label: '4px' },
  { value: 8, label: '8px' },
  { value: 16, label: '16px' },
  { value: 24, label: '24px' },
];

export const MangaReaderView: React.FC<MangaReaderViewProps> = ({
  series,
  chapter,
  initialReadingMode = null,
  initialPageNumber = null,
  allSeries = [],
  engineConfig,
  onUpdateEngineConfig,
  onSelectChapter,
  onSelectSeriesAndChapter,
  onUpdateReadingProgress,
  onExitReader,
  onOpenSeriesPage,
  onDownloadCurrentChapter,
  readLaterQueue = [],
  onToggleReadLaterChapter,
  onOpenReadLaterTab,
}) => {
  const modeResolution = useMemo(
    () => resolveSeriesReadingMode(series, engineConfig),
    [series, engineConfig]
  );

  const [readingMode, setReadingMode] = useState<ReadingMode>(
    () => initialReadingMode || modeResolution.mode
  );
  const [direction, setDirection] = useState<ReadingDirection>(
    () => modeResolution.direction
  );

  // Comix.to Reader Settings (cleanly housed in slide-over drawer, never cluttering the top of the comic)
  const [imageFit, setImageFit] = useState<ReaderImageFit>('width');
  const [webtoonWidth, setWebtoonWidth] = useState<WebtoonStripWidth>('800px');
  const [canvasTheme, setCanvasTheme] = useState<ReaderCanvasTheme>('oled');
  const [stripMarginPx, setStripMarginPx] = useState<number>(0);
  const [progressBarPos, setProgressBarPos] = useState<ProgressBarPosition>('left');
  const [headerHidden, setHeaderHidden] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [brightness, setBrightness] = useState<number>(100);
  const [contrast, setContrast] = useState<number>(100);
  const [warmth, setWarmth] = useState<number>(0);

  const [offsetFirstPage, setOffsetFirstPage] = useState<boolean>(true);
  const [autoScrollPlaying, setAutoScrollPlaying] = useState<boolean>(false);
  const [autoScrollSpeed, setAutoScrollSpeed] = useState<number>(1.0);

  // Comix.to Slide-Over Settings Drawer state (closed by default so reader is 100% distraction-free)
  const [showSettingsDrawer, setShowSettingsDrawer] = useState<boolean>(false);
  const [drawerTab, setDrawerTab] = useState<SettingsDrawerTab>('layout');
  const [hoverScrubPage, setHoverScrubPage] = useState<number | null>(null);

  const [activeSource, setActiveSource] = useState<SourceId>(series.primarySource);
  const [spreadIndex, setSpreadIndex] = useState(0);
  const [webtoonActivePage, setWebtoonActivePage] = useState(1);
  const [zoomPercent, setZoomPercent] = useState(100);
  const [downloadToast, setDownloadToast] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  const readerRootRef = useRef<HTMLDivElement | null>(null);
  const horizontalStripRef = useRef<HTMLDivElement | null>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  // Sync reading mode when series, explicit initialReadingMode, or auto-detection config changes
  useEffect(() => {
    if (initialReadingMode) {
      setReadingMode(initialReadingMode);
    } else {
      setReadingMode(modeResolution.mode);
      setDirection(modeResolution.direction);
    }
    setActiveSource(series.primarySource);
  }, [series.id, initialReadingMode, modeResolution.mode, modeResolution.direction]);

  // Live scraped chapter list & chapter page URLs from FMD2 engine
  const [liveSeriesChapters, setLiveSeriesChapters] = useState<MangaChapter[]>(series.chapters);
  const [livePageUrls, setLivePageUrls] = useState<string[]>([]);
  const [failedPageIndices, setFailedPageIndices] = useState<Set<number>>(new Set());
  const [loadingLivePages, setLoadingLivePages] = useState(false);
  const [preloadedPagesSet, setPreloadedPagesSet] = useState<Set<number>>(new Set([1, 2, 3, 4]));

  // Sync live chapter list for the active series & source so the reader chapter dropdown has all real chapters
  useEffect(() => {
    let isMounted = true;
    setLiveSeriesChapters(series.chapters);

    const fetchSeriesChapters = async () => {
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
          setLiveSeriesChapters(data.chapters);
          const matchingChap = data.chapters.find((c) => c.number === chapter.number);
          if (matchingChap && matchingChap.externalId && matchingChap.id !== chapter.id) {
            onSelectChapter(matchingChap);
          }
        }
      } catch {
        // Keep series.chapters
      }
    };

    fetchSeriesChapters();
    return () => {
      isMounted = false;
    };
  }, [series.id, series.title, series.slug, activeSource]);

  useEffect(() => {
    let isMounted = true;
    setLoadingLivePages(true);
    setLivePageUrls([]);
    setFailedPageIndices(new Set());

    const fetchChapterPages = async () => {
      try {
        const res = await fetch(
          `/api/manga/chapter-pages?title=${encodeURIComponent(
            series.title
          )}&chapterNumber=${encodeURIComponent(
            String(chapter.number)
          )}&sourceId=${encodeURIComponent(activeSource)}&externalId=${encodeURIComponent(
            chapter.externalId || ''
          )}`
        );
        if (!res.ok) return;
        const data = (await res.json()) as { pages?: string[] };
        if (isMounted && Array.isArray(data.pages) && data.pages.length > 0) {
          setLivePageUrls(data.pages);
        }
      } catch {
        // Ignore network error
      } finally {
        if (isMounted) setLoadingLivePages(false);
      }
    };

    fetchChapterPages();
    return () => {
      isMounted = false;
    };
  }, [series.title, chapter.id, chapter.number, chapter.externalId, activeSource]);

  const totalPages = livePageUrls.length > 0 ? livePageUrls.length : chapter.pagesCount || 12;
  const pageGroups = useMemo(
    () => computeReaderPageGroups(totalPages, readingMode, offsetFirstPage),
    [totalPages, readingMode, offsetFirstPage]
  );

  const currentModeMeta =
    READING_MODES_META.find((m) => m.id === readingMode) || READING_MODES_META[0];
  const isPaginated = currentModeMeta.isPaginated;
  const currentSpread = pageGroups[spreadIndex] || [1];
  const activePageNumber = isPaginated ? currentSpread[0] || 1 : webtoonActivePage;

  // Preload upcoming pages ahead of activePageNumber
  useEffect(() => {
    const nextPreloaded = new Set<number>();
    const bufferEnd = Math.min(totalPages, activePageNumber + 5);
    for (let p = 1; p <= bufferEnd; p++) {
      nextPreloaded.add(p);
      const url = livePageUrls[p - 1];
      if (url && typeof Image !== 'undefined') {
        const img = new Image();
        img.src = url;
      }
    }
    setPreloadedPagesSet(nextPreloaded);
  }, [activePageNumber, totalPages, livePageUrls]);

  const prevChapterNumberRef = useRef<number>(chapter.number);
  const appliedResumePageRef = useRef<boolean>(false);

  // Reset page index when chapter number changes, or apply initialPageNumber on resume
  useEffect(() => {
    setAutoScrollPlaying(false);
    if (prevChapterNumberRef.current !== chapter.number) {
      prevChapterNumberRef.current = chapter.number;
      setSpreadIndex(0);
      setWebtoonActivePage(1);
      appliedResumePageRef.current = true;
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    if (initialPageNumber && initialPageNumber > 1 && !appliedResumePageRef.current) {
      const clamped = Math.max(1, Math.min(totalPages, initialPageNumber));
      const targetGroupIdx = pageGroups.findIndex((grp) => grp.includes(clamped));
      if (targetGroupIdx >= 0) {
        setSpreadIndex(targetGroupIdx);
      }
      setWebtoonActivePage(clamped);
      appliedResumePageRef.current = true;
    }
  }, [chapter.number, readingMode, offsetFirstPage, initialPageNumber, totalPages, pageGroups]);

  // Report live reading session progress back to App catalog tracker
  useEffect(() => {
    if (!onUpdateReadingProgress) return;
    onUpdateReadingProgress({
      chapter,
      lastPage: activePageNumber,
      totalPages,
      sourceId: activeSource,
      readingMode,
    });

    const heartbeat = window.setInterval(() => {
      onUpdateReadingProgress({
        chapter,
        lastPage: activePageNumber,
        totalPages,
        sourceId: activeSource,
        readingMode,
      });
    }, 10000);

    return () => window.clearInterval(heartbeat);
  }, [
    chapter.id,
    chapter.number,
    chapter.title,
    chapter.externalId,
    activePageNumber,
    totalPages,
    activeSource,
    readingMode,
  ]);

  // Continuous Auto-Scroll effect
  useEffect(() => {
    if (!autoScrollPlaying) return;
    const pixelsPerTick = autoScrollSpeed * 2.4;
    const interval = window.setInterval(() => {
      window.scrollBy({ top: pixelsPerTick, behavior: 'auto' });
    }, 28);
    return () => window.clearInterval(interval);
  }, [autoScrollPlaying, autoScrollSpeed]);

  // Track visible page in Webtoon mode
  useEffect(() => {
    if (readingMode !== 'webtoon') return;
    const handleScroll = () => {
      let closestPage = 1;
      let closestDist = Infinity;
      const viewportCenter = window.innerHeight * 0.4;
      pageRefs.current.forEach((el, pageNum) => {
        const rect = el.getBoundingClientRect();
        const dist = Math.abs(rect.top - viewportCenter);
        if (dist < closestDist) {
          closestDist = dist;
          closestPage = pageNum;
        }
      });
      setWebtoonActivePage(closestPage);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [readingMode, totalPages]);

  const sortedChaptersAsc = useMemo(
    () => [...liveSeriesChapters].sort((a, b) => a.number - b.number),
    [liveSeriesChapters]
  );

  const currentChapterIdx = sortedChaptersAsc.findIndex(
    (c) => c.id === chapter.id || c.number === chapter.number
  );
  const prevChapter = currentChapterIdx > 0 ? sortedChaptersAsc[currentChapterIdx - 1] : null;
  const nextChapter =
    currentChapterIdx >= 0 && currentChapterIdx < sortedChaptersAsc.length - 1
      ? sortedChaptersAsc[currentChapterIdx + 1]
      : null;

  const canGoPrevPage = spreadIndex > 0;
  const canGoNextPage = spreadIndex < pageGroups.length - 1;

  const goNext = () => {
    if (canGoNextPage) {
      setSpreadIndex((i) => Math.min(pageGroups.length - 1, i + 1));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (nextChapter) {
      onSelectChapter(nextChapter);
    }
  };

  const goPrev = () => {
    if (canGoPrevPage) {
      setSpreadIndex((i) => Math.max(0, i - 1));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (prevChapter) {
      onSelectChapter(prevChapter);
    }
  };

  const jumpToPageNumber = (targetPage: number) => {
    const clamped = Math.max(1, Math.min(totalPages, targetPage));
    if (isPaginated) {
      const targetGroupIdx = pageGroups.findIndex((grp) => grp.includes(clamped));
      if (targetGroupIdx >= 0) {
        setSpreadIndex(targetGroupIdx);
      }
    } else {
      setWebtoonActivePage(clamped);
      const el = pageRefs.current.get(clamped);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  };

  const toggleFullscreen = () => {
    if (typeof document === 'undefined') return;
    if (!document.fullscreenElement) {
      readerRootRef.current?.requestFullscreen?.().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.().catch(() => {});
      setIsFullscreen(false);
    }
  };

  // Comix.to Keyboard Shortcuts (Arrow keys, Space, M, D, W, T, H, S, F, [ and ])
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLSelectElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      const key = e.key;

      if (key === 'Escape' && showSettingsDrawer) {
        e.preventDefault();
        setShowSettingsDrawer(false);
        return;
      }
      if (key === 'o' || key === 'O') {
        e.preventDefault();
        setShowSettingsDrawer((prev) => !prev);
        return;
      }
      if (key === 'h' || key === 'H') {
        e.preventDefault();
        setHeaderHidden((prev) => !prev);
        return;
      }
      if (key === 'f' || key === 'F') {
        e.preventDefault();
        toggleFullscreen();
        return;
      }
      if (key === 'm' || key === 'M') {
        e.preventDefault();
        const idx = READING_MODES_META.findIndex((m) => m.id === readingMode);
        const nextMode = READING_MODES_META[(idx + 1) % READING_MODES_META.length];
        if (nextMode) setReadingMode(nextMode.id);
        return;
      }
      if (key === 'x' || key === 'X') {
        e.preventDefault();
        setDirection((d) => (d === 'rtl' ? 'ltr' : 'rtl'));
        return;
      }
      if (key === 'w' || key === 'W') {
        e.preventDefault();
        const idx = READER_IMAGE_FIT_META.findIndex((f) => f.id === imageFit);
        const nextFit = READER_IMAGE_FIT_META[(idx + 1) % READER_IMAGE_FIT_META.length];
        if (nextFit) setImageFit(nextFit.id);
        return;
      }
      if (key === 't' || key === 'T') {
        e.preventDefault();
        const idx = READER_CANVAS_THEMES_META.findIndex((t) => t.id === canvasTheme);
        const nextTheme =
          READER_CANVAS_THEMES_META[(idx + 1) % READER_CANVAS_THEMES_META.length];
        if (nextTheme) setCanvasTheme(nextTheme.id);
        return;
      }
      if (key === '[') {
        e.preventDefault();
        if (prevChapter) onSelectChapter(prevChapter);
        return;
      }
      if (key === ']') {
        e.preventDefault();
        if (nextChapter) onSelectChapter(nextChapter);
        return;
      }
      if (key === ' ') {
        e.preventDefault();
        if (readingMode === 'webtoon') {
          setAutoScrollPlaying((p) => !p);
        } else {
          goNext();
        }
        return;
      }

      if (readingMode === 'single' || readingMode === 'double') {
        if (key === 'ArrowRight') {
          e.preventDefault();
          if (direction === 'rtl') goPrev();
          else goNext();
        } else if (key === 'ArrowLeft') {
          e.preventDefault();
          if (direction === 'rtl') goNext();
          else goPrev();
        }
      } else if (readingMode === 'vertical-paged') {
        if (key === 'ArrowDown' || key === 'PageDown') {
          e.preventDefault();
          goNext();
        } else if (key === 'ArrowUp' || key === 'PageUp') {
          e.preventDefault();
          goPrev();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  const displayPages = useMemo(
    () => getSpreadDisplayPages(currentSpread, readingMode, direction),
    [currentSpread, readingMode, direction]
  );

  const opticalFilterCss = useMemo(
    () => computeReaderOpticalFilterCss(brightness, contrast, warmth),
    [brightness, contrast, warmth]
  );

  const activeCanvasThemeMeta =
    READER_CANVAS_THEMES_META.find((t) => t.id === canvasTheme) ||
    READER_CANVAS_THEMES_META[0];

  const isCurrentChapterInReadLater = useMemo(
    () => isChapterInReadLaterQueue(readLaterQueue, series.id, chapter),
    [readLaterQueue, series.id, chapter]
  );

  const isNextChapterInReadLater = useMemo(
    () =>
      nextChapter
        ? isChapterInReadLaterQueue(readLaterQueue, series.id, nextChapter)
        : false,
    [readLaterQueue, series.id, nextChapter]
  );

  const handleToggleCurrentReadLater = () => {
    if (!onToggleReadLaterChapter) return;
    const wasSaved = isCurrentChapterInReadLater;
    onToggleReadLaterChapter(series, chapter, activeSource);
    setDownloadToast(
      wasSaved
        ? `Removed "${series.title} · Ch. ${chapter.number}" from Read Later queue`
        : `Saved "${series.title} · Ch. ${chapter.number}" to Read Later queue`
    );
    setTimeout(() => setDownloadToast(null), 3500);
  };

  const handleToggleNextReadLater = () => {
    if (!onToggleReadLaterChapter || !nextChapter) return;
    const wasSaved = isNextChapterInReadLater;
    onToggleReadLaterChapter(series, nextChapter, activeSource);
    setDownloadToast(
      wasSaved
        ? `Removed "${series.title} · Ch. ${nextChapter.number}" from Read Later queue`
        : `Saved "${series.title} · Ch. ${nextChapter.number}" to Read Later queue`
    );
    setTimeout(() => setDownloadToast(null), 3500);
  };

  const handleQuickDownload = async () => {
    setIsDownloading(true);
    try {
      const res = await onDownloadCurrentChapter(series, chapter, activeSource);
      const files = res?.downloadedFiles || [];
      setDownloadToast(
        files.length > 0
          ? `Downloaded "${files[0]}"`
          : `Queued Ch. ${chapter.number} in FMD2 Downloader`
      );
      setTimeout(() => setDownloadToast(null), 3500);
    } finally {
      setIsDownloading(false);
    }
  };

  const getModeIcon = (modeId: ReadingMode) => {
    switch (modeId) {
      case 'single':
        return <FileText className="w-3.5 h-3.5" />;
      case 'webtoon':
        return <ScrollText className="w-3.5 h-3.5" />;
      case 'double':
        return <Columns2 className="w-3.5 h-3.5" />;
      case 'vertical-paged':
        return <GalleryVertical className="w-3.5 h-3.5" />;
      case 'horizontal-strip':
        return <GalleryHorizontal className="w-3.5 h-3.5" />;
    }
  };

  const getComixModeShortName = (modeId: ReadingMode): string => {
    switch (modeId) {
      case 'webtoon':
        return 'Long Strip';
      case 'single':
        return 'Single Page';
      case 'double':
        return 'Double Page';
      case 'vertical-paged':
        return 'Vertical Page';
      case 'horizontal-strip':
        return 'Horizontal Strip';
    }
  };

  const cyclePrimaryReadingMode = () => {
    const primaryOrder: ReadingMode[] = ['webtoon', 'single', 'double'];
    const idx = primaryOrder.indexOf(readingMode);
    const next = primaryOrder[(idx + 1) % primaryOrder.length];
    setReadingMode(next);
  };

  const renderPageItem = (pageNum: number, seamless: boolean = false) => {
    const liveUrl = livePageUrls[pageNum - 1];
    const hasFailed = failedPageIndices.has(pageNum);

    const fitHeightClass =
      (imageFit === 'height' || imageFit === 'contain') && isPaginated
        ? 'max-h-[86vh] w-auto mx-auto object-contain'
        : 'w-full h-auto';

    if (liveUrl && !hasFailed) {
      return (
        <div
          style={{ filter: opticalFilterCss !== 'none' ? opticalFilterCss : undefined }}
          className={`relative w-full overflow-hidden ${
            isPaginated ? 'min-h-[420px] flex items-center justify-center' : ''
          } ${seamless ? 'rounded-none border-0' : 'rounded border border-white/[0.07]/60'}`}
        >
          <img
            src={liveUrl}
            alt={`${series.title} Chapter ${chapter.number} Page ${pageNum}`}
            loading={isPaginated || pageNum <= 5 ? 'eager' : 'lazy'}
            onError={() =>
              setFailedPageIndices((prev) => {
                const next = new Set(prev);
                next.add(pageNum);
                return next;
              })
            }
            className={`${fitHeightClass} block mx-auto select-none`}
          />
        </div>
      );
    }

    if (loadingLivePages && livePageUrls.length === 0) {
      return (
        <div
          className={`skeleton-shimmer w-full aspect-[3/4.3] max-h-[80vh] bg-[#090A0F]/90 border border-white/[0.06] flex flex-col items-center justify-center gap-3 p-6 text-slate-400 ${
            seamless ? 'rounded-none border-x-0 border-t-0' : 'rounded-lg'
          }`}
        >
          <RefreshCw className="w-6 h-6 text-violet-400 animate-spin" />
          <div className="text-xs font-mono text-center">
            Loading {series.title} · Ch. {chapter.number} (Page {pageNum} / {totalPages})...
          </div>
        </div>
      );
    }

    return (
      <div
        className={`w-full aspect-[3/4.3] max-h-[80vh] bg-[#090A0F] border border-white/[0.06] flex flex-col items-center justify-center gap-3 p-6 text-slate-400 ${
          seamless ? 'rounded-none border-x-0 border-t-0' : 'rounded-lg'
        }`}
      >
        <div className="text-xs font-mono text-slate-300 text-center">
          {series.title} · Ch. {chapter.number} · Page {pageNum} / {totalPages}
        </div>
        <div className="text-[11px] text-slate-500 text-center max-w-md">
          Image failed to load from {activeSource}. Click below to retry or switch the source mirror in the top bar.
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setFailedPageIndices((prev) => {
              const next = new Set(prev);
              next.delete(pageNum);
              return next;
            });
          }}
          className="px-3 py-1.5 text-xs font-mono bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-white/[0.1] transition-colors cursor-pointer"
        >
          Retry Page {pageNum}
        </button>
      </div>
    );
  };

  // Compute container max-width from imageFit, webtoonWidth, and zoomPercent
  const getStageMaxWidthStyle = (): string => {
    if (readingMode === 'webtoon') {
      if (webtoonWidth === '100%') return '100%';
      const basePx = parseInt(webtoonWidth, 10) || 800;
      return `${Math.round((basePx * zoomPercent) / 100)}px`;
    }
    if (displayPages.length === 2) {
      return `${Math.round((1180 * zoomPercent) / 100)}px`;
    }
    if (imageFit === 'original') {
      return `${Math.round((1060 * zoomPercent) / 100)}px`;
    }
    if (imageFit === 'height' || imageFit === 'contain') {
      return `${Math.round((680 * zoomPercent) / 100)}px`;
    }
    return `${Math.round((860 * zoomPercent) / 100)}px`;
  };

  const leftAction = direction === 'rtl' ? goNext : goPrev;
  const rightAction = direction === 'rtl' ? goPrev : goNext;
  const leftLabel = direction === 'rtl' ? 'Next Page' : 'Previous Page';
  const rightLabel = direction === 'rtl' ? 'Previous Page' : 'Next Page';

  return (
    <div
      ref={readerRootRef}
      style={{ backgroundColor: activeCanvasThemeMeta.bgHex }}
      className="relative min-h-[calc(100vh-57px)] w-full flex flex-col select-none transition-colors duration-200"
      data-reading-mode={readingMode}
      data-direction={direction}
      data-canvas-theme={canvasTheme}
    >
      {/* COMIX.TO COMPACT READER HEADER BAR */}
      {!headerHidden ? (
        <div
          role="region"
          aria-label="Comix Reader Toolbar"
          className="sticky top-0 z-30 min-h-12 py-1.5 px-3 sm:px-5 bg-[#090D16]/95 backdrop-blur-md border-b border-white/[0.06] flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5 text-xs"
        >
          {/* Left Cluster: Back to Manga Page + Series Switcher or Title */}
          <div className="flex items-center gap-2 min-w-0 shrink-0">
            <button
              type="button"
              onClick={() => (onOpenSeriesPage ? onOpenSeriesPage(series) : onExitReader())}
              aria-label="Back to Manga Page"
              title={`Open ${series.title} Main Manga Page`}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-slate-300 hover:text-white bg-slate-900/90 hover:bg-slate-800 border border-white/[0.07] rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span className="hidden sm:inline font-medium">Manga Page</span>
            </button>

            {allSeries.length > 1 && onSelectSeriesAndChapter ? (
              <>
                <div className="hidden xl:block min-w-0">
                  <DropdownMenu<string>
                    id="reader-series-select"
                    ariaLabel="Switch Series in Reader"
                    value={series.id}
                    options={allSeries.map((s) => ({
                      value: s.id,
                      label: s.title,
                      badge: `${s.totalChapters} Ch`,
                    }))}
                    onChange={(val) => {
                      const targetSeries = allSeries.find((s) => s.id === val);
                      if (targetSeries) {
                        const targetChap =
                          targetSeries.chapters[targetSeries.chapters.length - 1] ||
                          targetSeries.chapters[0];
                        if (targetChap) {
                          onSelectSeriesAndChapter(targetSeries, targetChap);
                        }
                      }
                    }}
                    searchable
                    searchPlaceholder="Search series..."
                    menuWidthClass="w-72"
                    triggerClassName="max-w-[175px]"
                  />
                </div>
                {onOpenSeriesPage && (
                  <button
                    type="button"
                    onClick={() => onOpenSeriesPage(series)}
                    title={`View ${series.title} Main Manga Page & Chapter List`}
                    className="hidden lg:inline-block xl:hidden font-bold text-white hover:text-violet-400 font-display truncate max-w-[160px] transition-colors cursor-pointer"
                  >
                    {series.title}
                  </button>
                )}
              </>
            ) : onOpenSeriesPage ? (
              <button
                type="button"
                onClick={() => onOpenSeriesPage(series)}
                title={`View ${series.title} Main Manga Page & Chapter List`}
                className="hidden lg:inline-block font-bold text-white hover:text-violet-400 font-display truncate max-w-[180px] transition-colors cursor-pointer"
              >
                {series.title}
              </button>
            ) : (
              <span className="hidden sm:inline font-bold text-white font-display truncate sm:max-w-[180px]">
                {series.title}
              </span>
            )}
          </div>

          {/* Center Cluster: Comix.to Prev/Next Chapter + Chapter Select + Page Select + Source Select */}
          <div className="flex items-center gap-1.5 min-w-0 shrink-0">
            <button
              type="button"
              disabled={!prevChapter}
              onClick={() => prevChapter && onSelectChapter(prevChapter)}
              aria-label="Previous Chapter"
              title={prevChapter ? `Previous: Ch. ${prevChapter.number}` : 'First Chapter'}
              className="p-1.5 text-slate-300 hover:text-white disabled:opacity-35 bg-slate-900/90 hover:bg-slate-800 border border-white/[0.07] rounded-md transition-colors shrink-0 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <DropdownMenu<string>
              id="reader-chapter-select"
              ariaLabel="Select Chapter"
              value={
                sortedChaptersAsc.find(
                  (c) => c.id === chapter.id || c.number === chapter.number
                )?.id || chapter.id
              }
              options={sortedChaptersAsc.map((c) => ({
                value: c.id,
                label: `Ch. ${c.number} — ${c.title}`,
                badge: `${c.pagesCount}p`,
              }))}
              onChange={(val) => {
                const target = liveSeriesChapters.find((c) => c.id === val);
                if (target) onSelectChapter(target);
              }}
              searchable={sortedChaptersAsc.length > 6}
              searchPlaceholder="Filter chapters..."
              menuWidthClass="w-72"
              triggerClassName="max-w-[140px] sm:max-w-[185px]"
            />

            <button
              type="button"
              disabled={!nextChapter}
              onClick={() => nextChapter && onSelectChapter(nextChapter)}
              aria-label="Next Chapter"
              title={nextChapter ? `Next: Ch. ${nextChapter.number}` : 'Latest Chapter'}
              className="p-1.5 text-slate-300 hover:text-white disabled:opacity-35 bg-slate-900/90 hover:bg-slate-800 border border-white/[0.07] rounded-md transition-colors shrink-0 cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            {/* Page Jump Dropdown */}
            <div className="hidden md:block min-w-0">
              <DropdownMenu<string>
                id="reader-page-select"
                ariaLabel="Jump to Page"
                value={String(activePageNumber)}
                options={Array.from({ length: totalPages }, (_, idx) => idx + 1).map((pNum) => ({
                  value: String(pNum),
                  label: `Page ${pNum} / ${totalPages}`,
                }))}
                onChange={(val) => jumpToPageNumber(Number(val))}
                menuWidthClass="w-44"
                triggerClassName="max-w-[125px]"
              />
            </div>

            {/* Source Mirror Dropdown */}
            <div className="hidden lg:block min-w-0">
              <DropdownMenu<SourceId>
                id="reader-source-select"
                ariaLabel="Select Source Website"
                value={activeSource}
                options={series.availableSources.map((srcId) => {
                  const mod = FMD2_SOURCE_MODULES.find((m) => m.id === srcId);
                  return {
                    value: srcId,
                    label: mod?.name || srcId,
                    description: mod?.domain,
                    accentDotColor: 'bg-emerald-400',
                  };
                })}
                onChange={(val) => setActiveSource(val)}
                menuWidthClass="w-56"
                triggerClassName="max-w-[140px]"
              />
            </div>
          </div>

          {/* Right Cluster: Mode Dropdown, Auto-Scroll Switch, Read Later, Download, Hide Header, Settings */}
          <div className="flex items-center gap-1.5 min-w-0 shrink-0">
            {/* Reading Style Dropdown Menu */}
            <div className="hidden sm:block min-w-0">
              <DropdownMenu<ReadingMode>
                id="reader-mode-select"
                ariaLabel="Select Reading Style"
                value={readingMode}
                options={READING_MODES_META.map((mode) => ({
                  value: mode.id,
                  label: getComixModeShortName(mode.id),
                  description: mode.description,
                }))}
                onChange={(val) => setReadingMode(val)}
                align="right"
                menuWidthClass="w-60"
                triggerClassName="max-w-[135px]"
              />
            </div>

            {/* Quick Auto-Scroll Play/Pause Toggle Switch when in Long Strip mode */}
            {readingMode === 'webtoon' && (
              <button
                type="button"
                role="switch"
                aria-checked={autoScrollPlaying}
                onClick={() => setAutoScrollPlaying((prev) => !prev)}
                aria-label={autoScrollPlaying ? 'Pause Auto-Scroll' : 'Start Auto-Scroll'}
                title="Toggle Auto-Scroll (Spacebar)"
                className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border bg-slate-900/90 border-white/[0.07] text-slate-200 hover:text-white transition-colors cursor-pointer"
              >
                <span className="text-[11px] font-medium">Auto-Scroll</span>
                <span
                  aria-hidden="true"
                  className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors ${
                    autoScrollPlaying ? 'bg-emerald-500' : 'bg-slate-700'
                  }`}
                >
                  <span
                    className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                      autoScrollPlaying ? 'translate-x-3.5' : 'translate-x-0.5'
                    }`}
                  />
                </span>
              </button>
            )}

            {/* Save Chapter to Read Later Queue Button */}
            {onToggleReadLaterChapter && (
              <button
                type="button"
                onClick={handleToggleCurrentReadLater}
                aria-pressed={isCurrentChapterInReadLater}
                aria-label={
                  isCurrentChapterInReadLater
                    ? `Remove Chapter ${chapter.number} from Read Later`
                    : `Add Chapter ${chapter.number} to Read Later`
                }
                data-testid="reader-read-later-button"
                title={
                  isCurrentChapterInReadLater
                    ? `Ch. ${chapter.number} is saved in your Read Later queue (click to remove)`
                    : `Save Ch. ${chapter.number} to your Read Later queue`
                }
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  isCurrentChapterInReadLater
                    ? 'bg-amber-500/20 hover:bg-amber-500/30 border-amber-500/70 text-amber-200'
                    : 'bg-slate-900/90 hover:bg-slate-800 border-white/[0.07] text-slate-200 hover:text-white'
                }`}
              >
                {isCurrentChapterInReadLater ? (
                  <Check className="w-3.5 h-3.5 text-amber-400" />
                ) : (
                  <BookmarkPlus className="w-3.5 h-3.5 text-violet-400" />
                )}
                <span>
                  {isCurrentChapterInReadLater ? 'In Read Later' : 'Read Later'}
                </span>
              </button>
            )}

            {/* Quick CBZ Download Button */}
            <button
              type="button"
              disabled={isDownloading}
              onClick={handleQuickDownload}
              aria-label={`Download Chapter ${chapter.number}`}
              title={`Download Ch. ${chapter.number} Archive`}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-600/90 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden md:inline">
                {isDownloading ? 'Saving...' : `Ch. ${chapter.number}`}
              </span>
            </button>

            {/* Hide Header Toggle (Hotkey: H) */}
            <button
              type="button"
              onClick={() => setHeaderHidden(true)}
              aria-label="Hide Reader Header"
              title="Hide Header Bar (Hotkey: H)"
              className="p-1.5 text-slate-400 hover:text-white bg-slate-900/90 hover:bg-slate-800 border border-white/[0.07] rounded-md transition-colors cursor-pointer"
            >
              <EyeOff className="w-3.5 h-3.5" />
            </button>

            {/* Fullscreen Toggle (Hotkey: F) */}
            <button
              type="button"
              onClick={toggleFullscreen}
              aria-label="Toggle Fullscreen"
              title="Toggle Fullscreen (Hotkey: F)"
              className="hidden sm:inline-flex p-1.5 text-slate-400 hover:text-white bg-slate-900/90 hover:bg-slate-800 border border-white/[0.07] rounded-md transition-colors cursor-pointer"
            >
              {isFullscreen ? (
                <Minimize2 className="w-3.5 h-3.5" />
              ) : (
                <Maximize2 className="w-3.5 h-3.5" />
              )}
            </button>

            {/* Comix.to Reader Settings Button (Opens Slide-Over Right Drawer) */}
            <button
              type="button"
              onClick={() => setShowSettingsDrawer((prev) => !prev)}
              aria-expanded={showSettingsDrawer}
              aria-label="Reader Settings"
              title="Reader Settings (Hotkey: S)"
              className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                showSettingsDrawer
                  ? 'bg-violet-600 border-violet-500 text-white'
                  : 'bg-slate-900/90 hover:bg-slate-800 border-white/[0.07] text-slate-200 hover:text-white'
              }`}
            >
              <Settings className="w-3.5 h-3.5" />
              <span>Settings</span>
            </button>
          </div>
        </div>
      ) : (
        /* Floating Minimal Restore Pill when Header is Hidden (Comix.to Full-Bleed Mode) */
        <div className="fixed top-3 right-4 z-40 flex items-center gap-1.5 bg-[#090D16]/90 backdrop-blur-md border border-white/[0.07] rounded-lg px-2.5 py-1.5 shadow-xl text-xs font-mono">
          <span className="text-slate-300 tabular-nums">
            Ch. {chapter.number} · {activePageNumber}/{totalPages}
          </span>
          <button
            type="button"
            onClick={() => setHeaderHidden(false)}
            aria-label="Show Reader Header"
            className="flex items-center gap-1 px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded transition-colors cursor-pointer"
          >
            <Eye className="w-3 h-3" />
            <span>Header</span>
          </button>
          <button
            type="button"
            onClick={() => setShowSettingsDrawer(true)}
            aria-label="Reader Settings"
            className="p-1 bg-violet-600 hover:bg-violet-500 text-white rounded transition-colors cursor-pointer"
          >
            <Settings className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Toast Notification */}
      {downloadToast && (
        <div
          role="status"
          className="fixed bottom-12 right-5 z-40 text-xs font-mono text-emerald-200 bg-emerald-950/95 border border-emerald-700/70 rounded-lg px-3.5 py-2 shadow-xl flex items-center gap-3"
        >
          <span>{downloadToast}</span>
          {onOpenReadLaterTab && downloadToast.includes('Read Later') && (
            <button
              type="button"
              onClick={onOpenReadLaterTab}
              className="px-2 py-0.5 text-[11px] font-sans font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded transition-colors cursor-pointer whitespace-nowrap"
            >
              View Queue →
            </button>
          )}
        </div>
      )}

      {/* COMIX.TO LEFT OR RIGHT VERTICAL EDGE PROGRESS BAR */}
      {(progressBarPos === 'left' || progressBarPos === 'right') && (
        <div
          role="group"
          aria-label="Edge Page Progress Bar"
          onMouseLeave={() => setHoverScrubPage(null)}
          className={`hidden sm:flex fixed top-28 bottom-5 z-20 w-1.5 hover:w-3 transition-all flex-col gap-0.5 py-1 ${
            progressBarPos === 'left' ? 'left-2' : 'right-2'
          }`}
        >
          {Array.from({ length: totalPages }, (_, idx) => idx + 1).map((pNum) => {
            const isCurrent = isPaginated
              ? currentSpread.includes(pNum)
              : webtoonActivePage === pNum;
            const isPassed = pNum < activePageNumber;
            return (
              <button
                key={pNum}
                type="button"
                onMouseEnter={() => setHoverScrubPage(pNum)}
                onClick={() => jumpToPageNumber(pNum)}
                aria-label={`Jump to Page ${pNum}`}
                title={`Page ${pNum} / {totalPages}`}
                className={`flex-1 w-full rounded-full transition-colors cursor-pointer ${
                  isCurrent
                    ? 'bg-violet-500'
                    : isPassed
                    ? 'bg-violet-500/45 hover:bg-violet-400'
                    : 'bg-slate-800/80 hover:bg-slate-600'
                }`}
              />
            );
          })}
        </div>
      )}

      {/* MAIN IMMERSIVE READING STAGE (Immediate Manga Pages — Zero Button Clutter) */}
      <div className="flex-1 w-full flex flex-col items-center justify-start px-0 sm:px-4 py-2">
        {/* MODE 1: LONG STRIP / CONTINUOUS VERTICAL SCROLL (COMIX.TO DEFAULT FOR MANHWA/WEBTOON) */}
        {readingMode === 'webtoon' && (
          <div
            data-testid="webtoon-strip-container"
            className="w-full mx-auto flex flex-col transition-all duration-150"
            style={{
              maxWidth: getStageMaxWidthStyle(),
              gap: `${stripMarginPx}px`,
            }}
          >
            {Array.from({ length: totalPages }, (_, idx) => idx + 1).map((pageNum) => (
              <div
                key={pageNum}
                ref={(el) => {
                  if (el) pageRefs.current.set(pageNum, el);
                }}
              >
                {renderPageItem(pageNum, stripMarginPx === 0)}
              </div>
            ))}
          </div>
        )}

        {/* MODE 2: HORIZONTAL FILMSTRIP */}
        {readingMode === 'horizontal-strip' && (
          <div className="w-full py-2">
            <div
              ref={horizontalStripRef}
              dir={direction}
              data-testid="horizontal-strip-container"
              className="w-full flex items-start gap-4 overflow-x-auto snap-x snap-mandatory pb-4 pt-1 px-4"
            >
              {Array.from({ length: totalPages }, (_, idx) => idx + 1).map((pageNum) => (
                <div
                  key={pageNum}
                  dir="ltr"
                  ref={(el) => {
                    if (el) pageRefs.current.set(pageNum, el);
                  }}
                  className="snap-center shrink-0 transition-all duration-150"
                  style={{ width: `${Math.round((540 * zoomPercent) / 100)}px` }}
                >
                  {renderPageItem(pageNum, false)}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* MODES 3, 4, 5: SINGLE PAGE, DOUBLE PAGE SPREAD, VERTICAL PAGED */}
        {isPaginated && (
          <div
            className="relative w-full mx-auto flex flex-col items-center"
            style={{ maxWidth: getStageMaxWidthStyle() }}
          >
            {/* Interactive 3-Zone Click Stage (Left Zone / Center Toggle / Right Zone) */}
            <div
              data-testid="paginated-stage"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const clickX = e.clientX - rect.left;
                if (readingMode === 'vertical-paged') {
                  const clickY = e.clientY - rect.top;
                  if (clickY < rect.height * 0.35) goPrev();
                  else if (clickY > rect.height * 0.65) goNext();
                  else setHeaderHidden((h) => !h);
                } else if (clickX < rect.width * 0.38) {
                  leftAction();
                } else if (clickX > rect.width * 0.62) {
                  rightAction();
                } else {
                  setHeaderHidden((h) => !h);
                }
              }}
              className={`group relative w-full cursor-pointer grid items-center ${
                displayPages.length === 2
                  ? 'grid-cols-1 lg:grid-cols-2 gap-0 overflow-hidden shadow-2xl'
                  : 'grid-cols-1 gap-0'
              }`}
            >
              {/* Subtle Left Edge Hover Zone Button */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (readingMode === 'vertical-paged') goPrev();
                  else leftAction();
                }}
                aria-label={leftLabel}
                title={`${leftLabel} (${direction.toUpperCase()})`}
                className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity absolute left-2 top-1/2 -translate-y-1/2 z-10 p-2.5 rounded-full bg-slate-950/75 hover:bg-violet-600 text-white border border-white/[0.1]/70 shadow-lg cursor-pointer"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>

              {displayPages.map((pageNum, idx) => (
                <div
                  key={pageNum}
                  className={`relative ${
                    displayPages.length === 2 && idx === 0
                      ? 'lg:border-r lg:border-white/[0.06]'
                      : ''
                  }`}
                >
                  {renderPageItem(pageNum, true)}
                </div>
              ))}

              {/* Subtle Right Edge Hover Zone Button */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (readingMode === 'vertical-paged') goNext();
                  else rightAction();
                }}
                aria-label={rightLabel}
                title={`${rightLabel} (${direction.toUpperCase()})`}
                className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity absolute right-2 top-1/2 -translate-y-1/2 z-10 p-2.5 rounded-full bg-slate-950/75 hover:bg-violet-600 text-white border border-white/[0.1]/70 shadow-lg cursor-pointer"
              >
                <ChevronRight className="w-5 h-5" />
              </button>

              {/* Center Book Spine Shadow for Double Spread */}
              {displayPages.length === 2 && (
                <div
                  aria-hidden="true"
                  className="hidden lg:block pointer-events-none absolute inset-y-0 left-1/2 -translate-x-1/2 w-8 bg-gradient-to-r from-black/45 via-black/75 to-black/45"
                />
              )}
            </div>
          </div>
        )}

        {/* COMIX.TO END-OF-CHAPTER TRANSITION BAR */}
        <div
          className="w-full mx-auto mt-6 mb-8 px-4"
          style={{ maxWidth: getStageMaxWidthStyle() }}
        >
          <div className="bg-[#090A0F]/95 border border-white/[0.07]/90 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
            <button
              type="button"
              disabled={!prevChapter}
              onClick={() => prevChapter && onSelectChapter(prevChapter)}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-medium bg-[#11121A] hover:bg-slate-800 disabled:opacity-40 text-slate-200 border border-white/[0.07] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>{prevChapter ? `Prev: Ch. ${prevChapter.number}` : 'First Chapter'}</span>
            </button>

            <div className="text-center text-xs font-mono text-slate-400 tabular-nums">
              <span>
                Ch. {chapter.number} · Page {activePageNumber} / {totalPages}
              </span>
              <span aria-hidden="true"> · </span>
              <span>{getComixModeShortName(readingMode)}</span>
              {loadingLivePages ? (
                <span className="text-violet-400"> · Loading...</span>
              ) : (
                <span className="text-emerald-400">
                  {' '}
                  · {preloadedPagesSet.size}/{totalPages} preloaded
                </span>
              )}
            </div>

            <div className="w-full sm:w-auto flex flex-wrap items-center justify-center gap-2">
              {onToggleReadLaterChapter && (
                <button
                  type="button"
                  onClick={
                    nextChapter ? handleToggleNextReadLater : handleToggleCurrentReadLater
                  }
                  aria-pressed={
                    nextChapter ? isNextChapterInReadLater : isCurrentChapterInReadLater
                  }
                  className={`flex items-center justify-center gap-1.5 px-3.5 py-2.5 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    (nextChapter ? isNextChapterInReadLater : isCurrentChapterInReadLater)
                      ? 'bg-amber-500/20 border-amber-500/70 text-amber-200'
                      : 'bg-[#11121A] hover:bg-slate-800 border-white/[0.07] text-slate-200'
                  }`}
                >
                  <Clock className="w-3.5 h-3.5 text-amber-400" />
                  <span>
                    {nextChapter
                      ? isNextChapterInReadLater
                        ? `Ch. ${nextChapter.number} Saved in Read Later`
                        : `Save Next (Ch. ${nextChapter.number}) for Read Later`
                      : isCurrentChapterInReadLater
                      ? `Ch. ${chapter.number} in Read Later`
                      : `Save Ch. ${chapter.number} to Read Later`}
                  </span>
                </button>
              )}

              <button
                type="button"
                disabled={!nextChapter}
                onClick={() => nextChapter && onSelectChapter(nextChapter)}
                className="flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-semibold bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <span>
                  {nextChapter ? `Next: Ch. ${nextChapter.number}` : 'Latest Chapter Reached'}
                </span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* COMIX.TO BOTTOM SEGMENTED PROGRESS BAR (When progressBarPos === 'bottom') */}
      {progressBarPos === 'bottom' && (
        <div
          role="group"
          aria-label="Bottom Page Progress Scrubber"
          onMouseLeave={() => setHoverScrubPage(null)}
          className="sticky bottom-0 z-20 w-full bg-[#090D16]/95 backdrop-blur-md border-t border-white/[0.06] px-4 py-1.5 flex items-center gap-3"
        >
          <span className="text-[11px] font-mono tabular-nums text-slate-300 whitespace-nowrap shrink-0">
            {hoverScrubPage ? `Page ${hoverScrubPage}` : `${activePageNumber} / ${totalPages}`}
          </span>
          <div className="flex-1 flex items-center gap-1 h-2">
            {Array.from({ length: totalPages }, (_, idx) => idx + 1).map((pNum) => {
              const isCurrent = isPaginated
                ? currentSpread.includes(pNum)
                : webtoonActivePage === pNum;
              const isPassed = pNum < activePageNumber;
              return (
                <button
                  key={pNum}
                  type="button"
                  onMouseEnter={() => setHoverScrubPage(pNum)}
                  onClick={() => jumpToPageNumber(pNum)}
                  aria-label={`Jump to Page ${pNum}`}
                  className={`flex-1 h-full rounded-full transition-all cursor-pointer ${
                    isCurrent
                      ? 'bg-violet-500 h-2.5'
                      : isPassed
                      ? 'bg-violet-500/45 hover:bg-violet-400'
                      : 'bg-slate-800 hover:bg-slate-600'
                  }`}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* FLOATING MINIMAL PAGE COUNTER PILL (Bottom-Left or Bottom-Right) */}
      <div className="fixed bottom-3 left-5 z-20 pointer-events-none hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-md bg-[#090D16]/85 border border-white/[0.06] text-[11px] font-mono tabular-nums text-slate-300">
        <span>
          {activePageNumber} / {totalPages}
        </span>
        <span aria-hidden="true">·</span>
        <span className="text-slate-400">{getComixModeShortName(readingMode)}</span>
      </div>

      {/* COMIX.TO RIGHT-SIDE SLIDE-OVER SETTINGS DRAWER */}
      {showSettingsDrawer && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-xs animate-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Comix Reader Settings"
          onClick={() => setShowSettingsDrawer(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[390px] h-full bg-[#090A0F] border-l border-white/[0.07] shadow-2xl flex flex-col justify-between overflow-y-auto"
          >
            <div>
              {/* Drawer Header */}
              <div className="sticky top-0 z-10 bg-[#090A0F]/95 backdrop-blur-md px-5 py-4 border-b border-white/[0.07] flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-white font-display flex items-center gap-2">
                    <Settings className="w-4 h-4 text-violet-400" />
                    <span>Reader Settings</span>
                  </h2>
                  <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                    {series.title} · Ch. {chapter.number}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowSettingsDrawer(false)}
                  aria-label="Close Reader Settings"
                  className="p-1.5 text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 border border-white/[0.07] rounded-lg cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Drawer Segmented Section Tabs */}
              <div className="px-5 pt-3">
                <div className="grid grid-cols-3 gap-1 p-1 bg-[#11121A] border border-white/[0.07] rounded-lg text-xs">
                  {(
                    [
                      { id: 'layout', label: 'Layout & Strip' },
                      { id: 'display', label: 'Image & Theme' },
                      { id: 'shortcuts', label: 'Hotkeys' },
                    ] as const
                  ).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setDrawerTab(t.id)}
                      className={`py-1.5 px-2 rounded-md font-medium transition-colors whitespace-nowrap cursor-pointer ${
                        drawerTab === t.id
                          ? 'bg-violet-600 text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* TAB 1: LAYOUT & STRIP SETTINGS (Dropdowns & Toggle Switches) */}
              {drawerTab === 'layout' && (
                <div className="p-5 space-y-4 text-xs">
                  {/* Page Display / Reading Mode Dropdown */}
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold text-slate-200">
                      Page Display Style (M)
                    </span>
                    <DropdownMenu<ReadingMode>
                      id="drawer-reading-mode-select"
                      ariaLabel="Page Display Style (M)"
                      value={readingMode}
                      options={READING_MODES_META.map((mode) => ({
                        value: mode.id,
                        label: getComixModeShortName(mode.id),
                        description: mode.description,
                      }))}
                      onChange={(val) => setReadingMode(val)}
                      align="right"
                      menuWidthClass="w-56"
                    />
                  </div>

                  {/* Reading Direction Dropdown */}
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold text-slate-200">
                      Reading Direction (X)
                    </span>
                    {readingMode === 'webtoon' ? (
                      <span className="font-mono text-slate-400">Vertical Scroll</span>
                    ) : (
                      <DropdownMenu<ReadingDirection>
                        id="drawer-direction-select"
                        ariaLabel="Reading Direction (X)"
                        value={direction}
                        options={[
                          {
                            value: 'ltr',
                            label: 'Left to Right (LTR)',
                            description: 'Western / Manhwa direction',
                          },
                          {
                            value: 'rtl',
                            label: 'Right to Left (RTL)',
                            description: 'Traditional Japanese Manga',
                          },
                        ]}
                        onChange={(val) => setDirection(val)}
                        align="right"
                        menuWidthClass="w-56"
                      />
                    )}
                  </div>

                  {/* Strip Margin Dropdown */}
                  {readingMode === 'webtoon' && (
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-semibold text-slate-200">
                        Strip Page Margin
                      </span>
                      <DropdownMenu<string>
                        id="drawer-strip-margin-select"
                        ariaLabel="Strip Page Margin"
                        value={String(stripMarginPx)}
                        options={STRIP_MARGIN_PRESETS.map((preset) => ({
                          value: String(preset.value),
                          label: preset.label,
                        }))}
                        onChange={(val) => setStripMarginPx(Number(val))}
                        align="right"
                        menuWidthClass="w-44"
                      />
                    </div>
                  )}

                  {/* Double Spread Cover Page Offset Toggle Switch */}
                  {readingMode === 'double' && (
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-semibold text-slate-200">
                        Offset Cover Page ([1], [2–3])
                      </span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={offsetFirstPage}
                        onClick={() => setOffsetFirstPage((prev) => !prev)}
                        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors cursor-pointer ${
                          offsetFirstPage ? 'bg-violet-600' : 'bg-slate-700'
                        }`}
                      >
                        <span
                          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                            offsetFirstPage ? 'translate-x-4' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>
                  )}

                  {/* Progress Bar Position Dropdown */}
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold text-slate-200">
                      Progress Bar Position
                    </span>
                    <DropdownMenu<ProgressBarPosition>
                      id="drawer-progress-pos-select"
                      ariaLabel="Progress Bar Position"
                      value={progressBarPos}
                      options={[
                        { value: 'left', label: 'Left Edge' },
                        { value: 'bottom', label: 'Bottom Scrubber' },
                        { value: 'right', label: 'Right Edge' },
                        { value: 'hidden', label: 'Hidden' },
                      ]}
                      onChange={(val) => setProgressBarPos(val)}
                      align="right"
                      menuWidthClass="w-48"
                    />
                  </div>

                  {/* Sticky Top Header Visibility Toggle Switch */}
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold text-slate-200">
                      Sticky Top Toolbar (H)
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={!headerHidden}
                      onClick={() => setHeaderHidden((prev) => !prev)}
                      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors cursor-pointer ${
                        !headerHidden ? 'bg-violet-600' : 'bg-slate-700'
                      }`}
                    >
                      <span
                        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                          !headerHidden ? 'translate-x-4' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>

                  {/* Hands-Free Auto-Scroll Switch & Speed Dropdown */}
                  <div className="pt-3 border-t border-white/[0.06] space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-semibold text-slate-200">
                        Hands-Free Auto-Scroll
                      </span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={autoScrollPlaying}
                        onClick={() => setAutoScrollPlaying((prev) => !prev)}
                        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors cursor-pointer ${
                          autoScrollPlaying ? 'bg-emerald-500' : 'bg-slate-700'
                        }`}
                      >
                        <span
                          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                            autoScrollPlaying ? 'translate-x-4' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <span className="text-slate-400">
                        Scroll Speed
                      </span>
                      <DropdownMenu<string>
                        id="drawer-autoscroll-speed-select"
                        ariaLabel="Scroll Speed"
                        value={String(autoScrollSpeed)}
                        options={AUTO_SCROLL_SPEED_PRESETS.map((spd) => ({
                          value: String(spd),
                          label: `${spd}x Speed`,
                        }))}
                        onChange={(val) => {
                          setAutoScrollSpeed(Number(val));
                          setAutoScrollPlaying(true);
                        }}
                        align="right"
                        menuWidthClass="w-40"
                      />
                    </div>
                  </div>

                  {/* Genre & Metadata Auto-Mode Toggle Switch */}
                  <div className="pt-3 border-t border-white/[0.06] space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-semibold text-slate-200">
                        Auto-Mode by Genre/Tags
                      </span>
                      {onUpdateEngineConfig && (
                        <button
                          type="button"
                          role="switch"
                          aria-checked={engineConfig?.autoDetectReadingMode !== false}
                          onClick={() => {
                            const nextAuto = !(engineConfig?.autoDetectReadingMode !== false);
                            onUpdateEngineConfig({ autoDetectReadingMode: nextAuto });
                          }}
                          className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors cursor-pointer ${
                            engineConfig?.autoDetectReadingMode !== false
                              ? 'bg-violet-600'
                              : 'bg-slate-700'
                          }`}
                        >
                          <span
                            className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                              engineConfig?.autoDetectReadingMode !== false
                                ? 'translate-x-4'
                                : 'translate-x-1'
                            }`}
                          />
                        </button>
                      )}
                    </div>
                    <p className="text-[11px] font-mono text-slate-400">
                      {modeResolution.reasonSummary}
                    </p>
                  </div>
                </div>
              )}

              {/* TAB 2: IMAGE SIZING, ZOOM, CANVAS THEME & OPTICAL FILTERS */}
              {drawerTab === 'display' && (
                <div className="p-5 space-y-4 text-xs">
                  {/* Image Fit Mode Dropdown */}
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold text-slate-200">
                      Image Fit &amp; Scaling (W)
                    </span>
                    <DropdownMenu<ReaderImageFit>
                      id="drawer-image-fit-select"
                      ariaLabel="Image Fit & Scaling (W)"
                      value={imageFit}
                      options={READER_IMAGE_FIT_META.map((fit) => ({
                        value: fit.id,
                        label: fit.shortLabel,
                        description: fit.label,
                      }))}
                      onChange={(val) => setImageFit(val)}
                      align="right"
                      menuWidthClass="w-52"
                    />
                  </div>

                  {/* Strip Column Width Dropdown */}
                  {readingMode === 'webtoon' && (
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-semibold text-slate-200">
                        Long Strip Width
                      </span>
                      <DropdownMenu<WebtoonStripWidth>
                        id="drawer-webtoon-width-select"
                        ariaLabel="Long Strip Width"
                        value={webtoonWidth}
                        options={WEBTOON_WIDTH_OPTIONS.map((wOpt) => ({
                          value: wOpt.id,
                          label: wOpt.label,
                        }))}
                        onChange={(val) => setWebtoonWidth(val)}
                        align="right"
                        menuWidthClass="w-48"
                      />
                    </div>
                  )}

                  {/* Zoom Stepper */}
                  <div className="space-y-2 pt-2 border-t border-white/[0.06]">
                    <div className="flex items-center justify-between">
                      <label className="font-semibold text-slate-200">Page Zoom Scale</label>
                      <span className="font-mono text-violet-400 tabular-nums">
                        {zoomPercent}%
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        aria-label="Zoom out"
                        onClick={() => setZoomPercent((z) => Math.max(50, z - 15))}
                        className="p-2 bg-[#11121A] hover:bg-slate-800 border border-white/[0.07] rounded-lg text-slate-200 cursor-pointer"
                      >
                        <ZoomOut className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setZoomPercent(100)}
                        className="flex-1 py-2 bg-[#11121A] hover:bg-slate-800 border border-white/[0.07] rounded-lg font-mono text-slate-200 cursor-pointer"
                      >
                        Reset (100%)
                      </button>
                      <button
                        type="button"
                        aria-label="Zoom in"
                        onClick={() => setZoomPercent((z) => Math.min(200, z + 15))}
                        className="p-2 bg-[#11121A] hover:bg-slate-800 border border-white/[0.07] rounded-lg text-slate-200 cursor-pointer"
                      >
                        <ZoomIn className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Canvas Background Theme Dropdown */}
                  <div className="flex items-center justify-between gap-3 pt-2 border-t border-white/[0.06]">
                    <span className="font-semibold text-slate-200">
                      Canvas Background (T)
                    </span>
                    <DropdownMenu<ReaderCanvasTheme>
                      id="drawer-canvas-theme-select"
                      ariaLabel="Canvas Background (T)"
                      value={canvasTheme}
                      options={READER_CANVAS_THEMES_META.map((theme) => ({
                        value: theme.id,
                        label: theme.label,
                        badge: theme.bgHex,
                      }))}
                      onChange={(val) => setCanvasTheme(val)}
                      align="right"
                      menuWidthClass="w-52"
                    />
                  </div>

                  {/* Eye-Care Optical Filters */}
                  <div className="space-y-3 pt-2 border-t border-white/[0.06]">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                        <Sun className="w-3.5 h-3.5 text-amber-400" />
                        <span>Eye-Care Optical Filters</span>
                      </span>
                      {(brightness !== 100 || contrast !== 100 || warmth !== 0) && (
                        <button
                          type="button"
                          onClick={() => {
                            setBrightness(100);
                            setContrast(100);
                            setWarmth(0);
                          }}
                          className="flex items-center gap-1 text-[11px] font-mono text-violet-400 hover:text-violet-300 cursor-pointer"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Reset</span>
                        </button>
                      )}
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between font-mono text-[11px]">
                        <label htmlFor="reader-brightness-slider" className="text-slate-300">
                          Brightness ({brightness}%)
                        </label>
                        <input
                          id="reader-brightness-slider"
                          type="range"
                          min={50}
                          max={130}
                          step={5}
                          value={brightness}
                          onChange={(e) => setBrightness(Number(e.target.value))}
                          className="w-36 accent-violet-500 cursor-pointer"
                        />
                      </div>
                      <div className="flex items-center justify-between font-mono text-[11px]">
                        <label htmlFor="reader-warmth-slider" className="text-slate-300">
                          Warmth / Sepia ({warmth}%)
                        </label>
                        <input
                          id="reader-warmth-slider"
                          type="range"
                          min={0}
                          max={50}
                          step={5}
                          value={warmth}
                          onChange={(e) => setWarmth(Number(e.target.value))}
                          className="w-36 accent-amber-500 cursor-pointer"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: KEYBOARD SHORTCUTS & TAP ZONES */}
              {drawerTab === 'shortcuts' && (
                <div className="p-5 space-y-4 text-xs">
                  <div className="flex items-center gap-2 font-semibold text-white">
                    <Keyboard className="w-4 h-4 text-violet-400" />
                    <span>Comix Reader Keyboard Shortcuts</span>
                  </div>

                  <div className="divide-y divide-slate-800/80 border border-white/[0.07] rounded-lg bg-[#11121A] font-mono text-[11px]">
                    {[
                      { key: 'C / B / D / R / A / S', desc: 'Switch Primary App Tabs' },
                      { key: '← / →', desc: 'Previous / Next Page' },
                      { key: '[ / ]', desc: 'Previous / Next Chapter' },
                      { key: 'M', desc: 'Cycle Reading Style' },
                      { key: 'X', desc: 'Toggle LTR / RTL Direction' },
                      { key: 'W', desc: 'Cycle Image Fit Mode' },
                      { key: 'H', desc: 'Hide / Show Top Header Bar' },
                      { key: 'O', desc: 'Open / Close Settings Drawer' },
                      { key: 'F', desc: 'Toggle Fullscreen Reader' },
                      { key: 'Space', desc: 'Toggle Auto-Scroll / Next Page' },
                    ].map((row) => (
                      <div
                        key={row.key}
                        className="px-3 py-2 flex items-center justify-between gap-2"
                      >
                        <span className="text-slate-400">{row.desc}</span>
                        <kbd className="px-2 py-0.5 bg-[#090A0F] border border-white/[0.1] rounded text-violet-300">
                          {row.key}
                        </kbd>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Drawer Footer */}
            <div className="p-4 border-t border-white/[0.07] bg-[#090D16] flex items-center justify-between text-[11px] font-mono text-slate-400">
              <span>
                {FMD2_SOURCE_MODULES.find((m) => m.id === activeSource)?.name || activeSource}
              </span>
              <button
                type="button"
                onClick={() => setShowSettingsDrawer(false)}
                className="px-4 py-1.5 bg-violet-600 hover:bg-violet-500 text-white font-sans font-semibold rounded-md cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
