import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Bookmark,
  BookOpen,
  ChevronRight,
  Heart,
  ListFilter,
  MessageCircle,
  Play,
  Sparkles,
  Star,
  Users,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import {
  formatRelativeReadTime,
  getSeriesContentFormat,
  type MangaChapter,
  type MangaSeries,
  type ReadingSessionProgress,
} from '../utils/fmdLogic.ts';
import { MangaCoverArt } from './MangaArtRenderer.tsx';

type TimeWindow = '1D' | '1W' | '1M' | 'ALL';

interface DiscoverHomeViewProps {
  catalog: MangaSeries[];
  recentlyReadEntries: { series: MangaSeries; progress: ReadingSessionProgress }[];
  bookmarkedIds: string[];
  isLoading: boolean;
  onResumeSeries: (series: MangaSeries, progress: ReadingSessionProgress) => void;
  onInspectSeries: (series: MangaSeries) => void;
  onReadChapter: (series: MangaSeries, chapter: MangaChapter) => void;
  onToggleBookmark: (seriesId: string) => void;
  onBrowseAll: () => void;
  onOpenSearch: () => void;
}

const transition = { duration: 0.28, ease: [0.22, 1, 0.36, 1] as const };

function chapterToRead(series: MangaSeries): MangaChapter | undefined {
  return series.chapters[series.chapters.length - 1] || series.chapters[0];
}

function SeriesFormatBadge({ series }: { series: MangaSeries }) {
  const format = getSeriesContentFormat(series);
  const color =
    format === 'Manhwa'
      ? 'border-sky-300/20 bg-sky-400/10 text-sky-200'
      : format === 'Manhua'
        ? 'border-emerald-300/20 bg-emerald-400/10 text-emerald-200'
        : 'border-rose-300/20 bg-rose-400/10 text-rose-200';

  return (
    <span className={`rounded-md border px-2 py-1 text-[9px] font-bold uppercase tracking-[0.14em] ${color}`}>
      {format}
    </span>
  );
}

function PosterCard({
  series,
  rank,
  bookmarked,
  onInspect,
  onToggleBookmark,
}: {
  series: MangaSeries;
  rank?: number;
  bookmarked: boolean;
  onInspect: () => void;
  onToggleBookmark: () => void;
}) {
  const isMature = (series.metadataTags || []).some((tag) => /18\+|nsfw|mature/i.test(tag));
  const [revealed, setRevealed] = useState(false);

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={transition}
      whileHover={{ y: -4 }}
      className="group min-w-0"
    >
      <div className="relative mb-3 aspect-[2/3] overflow-hidden rounded-xl border border-white/[0.07] bg-[#12141D] shadow-[0_14px_40px_-26px_rgba(0,0,0,.9)]">
        <button type="button" onClick={onInspect} className="absolute inset-0 z-0 cursor-pointer text-left">
          <MangaCoverArt
            series={series}
            className="!absolute !inset-0 !h-full !w-full !border-0 !p-0 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.04]"
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/95 via-black/10 to-black/5 opacity-85 transition-opacity duration-200 group-hover:opacity-100" />
          {isMature && !revealed && (
            <div className="absolute inset-0 z-10 grid place-items-center bg-black/45 p-4 text-center backdrop-blur-md">
              <span className="rounded-full border border-rose-200/25 bg-black/50 px-3 py-2 text-[10px] font-semibold text-rose-100">
                18+ NSFW · tap to reveal
              </span>
            </div>
          )}
        </button>
        {isMature && !revealed && (
          <button
            type="button"
            onClick={() => setRevealed(true)}
            className="absolute inset-0 z-20 cursor-pointer"
            aria-label={`Reveal mature cover for ${series.title}`}
          />
        )}
        <button
          type="button"
          onClick={onToggleBookmark}
          aria-label={bookmarked ? `Remove ${series.title} from bookmarks` : `Bookmark ${series.title}`}
          className={`absolute right-2 top-2 z-30 grid h-8 w-8 place-items-center rounded-lg border backdrop-blur-md transition-all duration-200 ${
            bookmarked
              ? 'border-violet-300/35 bg-violet-500/25 text-violet-100'
              : 'translate-y-1 border-white/10 bg-black/45 text-white opacity-0 group-hover:translate-y-0 group-hover:opacity-100 focus-visible:translate-y-0 focus-visible:opacity-100'
          }`}
        >
          <Bookmark className="h-4 w-4" fill={bookmarked ? 'currentColor' : 'none'} />
        </button>
        {rank !== undefined && (
          <span className="pointer-events-none absolute bottom-0 left-2 z-10 font-display text-5xl font-black leading-none tracking-[-0.08em] text-white/80 [text-shadow:0_2px_18px_rgba(0,0,0,.8)]">
            {String(rank).padStart(2, '0')}
          </span>
        )}
        <span className="absolute left-2 top-2 z-10 rounded-md border border-white/10 bg-black/55 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-white/90 backdrop-blur-md">
          {series.status}
        </span>
      </div>
      <button type="button" onClick={onInspect} className="block w-full text-left">
        <SeriesFormatBadge series={series} />
        <h3 className="mt-2 line-clamp-1 text-[13px] font-semibold tracking-tight text-[#F4F1FA] transition-colors group-hover:text-violet-200">
          {series.title}
        </h3>
        <div className="mt-1.5 flex items-center justify-between gap-2 text-[10px] text-white/45">
          <span className="flex min-w-0 items-center gap-1 truncate">
            <Star className="h-3 w-3 shrink-0 fill-amber-300 text-amber-300" />
            <span className="text-white/70">{Number(series.rating || 0).toFixed(1)}</span>
            <span>·</span>
            <span className="truncate">{series.totalChapters} chapters</span>
          </span>
          <span className="shrink-0">{series.year || '—'}</span>
        </div>
      </button>
    </motion.article>
  );
}

function SectionTitle({
  eyebrow,
  title,
  action,
  onAction,
}: {
  eyebrow?: string;
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div>
        {eyebrow && <p className="mb-1 text-[9px] font-bold uppercase tracking-[0.22em] text-violet-300/70">{eyebrow}</p>}
        <h2 className="font-display text-xl font-bold tracking-tight text-[#F5F2FA] sm:text-2xl">{title}</h2>
      </div>
      {action && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="group inline-flex shrink-0 items-center gap-1.5 text-[11px] font-semibold text-white/50 transition-colors hover:text-white"
        >
          {action}<ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </button>
      )}
    </div>
  );
}

function RankingShelf({
  title,
  eyebrow,
  series,
  bookmarkedIds,
  onInspectSeries,
  onToggleBookmark,
}: {
  title: string;
  eyebrow: string;
  series: MangaSeries[];
  bookmarkedIds: string[];
  onInspectSeries: (series: MangaSeries) => void;
  onToggleBookmark: (seriesId: string) => void;
}) {
  const [timeWindow, setTimeWindow] = useState<TimeWindow>('1W');
  const tabs: TimeWindow[] = ['1D', '1W', '1M', 'ALL'];

  return (
    <section className="min-w-0">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="mb-1 text-[9px] font-bold uppercase tracking-[0.22em] text-violet-300/70">{eyebrow}</p>
          <h2 className="font-display text-xl font-bold tracking-tight text-[#F5F2FA]">{title}</h2>
        </div>
        <div className="inline-flex rounded-lg border border-white/[0.07] bg-[#101118] p-1" role="tablist" aria-label={`${title} time window`}>
          {tabs.map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={timeWindow === tab}
              onClick={() => setTimeWindow(tab)}
              title="The current live sources do not publish time-window engagement totals."
              className="relative rounded-md px-2.5 py-1.5 text-[9px] font-bold tracking-wide text-white/50 transition-colors hover:text-white"
            >
              {timeWindow === tab && (
                <motion.span
                  layoutId={`${title}-time-window`}
                  className="absolute inset-0 rounded-md bg-violet-500/20 ring-1 ring-violet-400/20"
                  transition={transition}
                />
              )}
              <span className={`relative z-10 ${timeWindow === tab ? 'text-violet-100' : ''}`}>{tab}</span>
            </button>
          ))}
        </div>
      </div>
      <p className="-mt-2 mb-4 text-[9px] text-white/30">Catalog estimate from source ratings and chapter volume. Live view and bookmark totals are not available from these feeds.</p>
      <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 xl:grid-cols-5">
        {series.slice(0, 5).map((item, index) => (
          <PosterCard
            key={item.id}
            series={item}
            rank={index + 1}
            bookmarked={bookmarkedIds.includes(item.id)}
            onInspect={() => onInspectSeries(item)}
            onToggleBookmark={() => onToggleBookmark(item.id)}
          />
        ))}
      </div>
    </section>
  );
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export const DiscoverHomeView: React.FC<DiscoverHomeViewProps> = ({
  catalog,
  recentlyReadEntries,
  bookmarkedIds,
  isLoading,
  onResumeSeries,
  onInspectSeries,
  onReadChapter,
  onToggleBookmark,
  onBrowseAll,
  onOpenSearch,
}) => {
  const [activeHeroId, setActiveHeroId] = useState('');
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installDismissed, setInstallDismissed] = useState(false);

  const spotlightSeries = useMemo(
    () => [...catalog].sort((a, b) => b.rating - a.rating || b.totalChapters - a.totalChapters).slice(0, 5),
    [catalog]
  );
  const featured = spotlightSeries.find((series) => series.id === activeHeroId) || spotlightSeries[0];
  const popularSeries = useMemo(
    () => [...catalog].sort((a, b) => b.rating * 100 + Math.min(b.totalChapters, 300) - (a.rating * 100 + Math.min(a.totalChapters, 300))),
    [catalog]
  );
  const bookmarkedSeries = useMemo(() => {
    const saved = catalog.filter((series) => bookmarkedIds.includes(series.id));
    return saved.length > 0 ? saved : popularSeries;
  }, [catalog, bookmarkedIds, popularSeries]);
  const recentUpdates = useMemo(
      () => [...catalog].sort((a, b) => {
      const aDate = Date.parse(a.chapters[a.chapters.length - 1]?.releaseDate || '') || 0;
      const bDate = Date.parse(b.chapters[b.chapters.length - 1]?.releaseDate || '') || 0;
      return bDate - aDate || b.totalChapters - a.totalChapters;
    }),
    [catalog]
  );
  const authors = useMemo(() => {
    const counts = new Map<string, number>();
    catalog.forEach((series) => {
      if (series.author && series.author !== 'Unknown') counts.set(series.author, (counts.get(series.author) || 0) + 1);
    });
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [catalog]);
  const topGenres = useMemo(() => {
    const counts = new Map<string, MangaSeries[]>();
    catalog.forEach((series) => series.genres.forEach((genre) => {
      const matches = counts.get(genre) || [];
      matches.push(series);
      counts.set(genre, matches);
    }));
    return [...counts.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 4);
  }, [catalog]);

  useEffect(() => {
    const handleInstallAvailable = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handleInstallAvailable);
    return () => window.removeEventListener('beforeinstallprompt', handleInstallAvailable);
  }, []);

  const handleInstall = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  };

  const handleFeaturedRead = () => {
    if (!featured) return;
    const chapter = chapterToRead(featured);
    if (chapter) onReadChapter(featured, chapter);
    else onInspectSeries(featured);
  };

  const showSkeletons = isLoading && catalog.length === 0;

  return (
    <div className="discovery-home mx-auto max-w-[1500px] space-y-12 pb-24 lg:pb-10">
      {!installDismissed && installPrompt && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between gap-4 rounded-xl border border-violet-400/15 bg-violet-500/[0.07] px-4 py-3"
        >
          <div className="min-w-0">
            <p className="text-xs font-semibold text-violet-100">Take your library with you</p>
            <p className="mt-0.5 text-[10px] text-white/45">Install FMD2 Studio for a cleaner desktop reading experience.</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button type="button" onClick={() => setInstallDismissed(true)} className="rounded-lg px-2.5 py-2 text-[10px] font-medium text-white/45 hover:text-white">Later</button>
            <button type="button" onClick={() => void handleInstall()} className="rounded-lg bg-violet-500 px-3 py-2 text-[10px] font-bold text-white transition-colors hover:bg-violet-400">Install</button>
          </div>
        </motion.div>
      )}

      <section className="relative overflow-hidden rounded-2xl border border-white/[0.07] bg-[#11121A] shadow-[0_28px_100px_-60px_rgba(124,58,237,.55)]">
        {featured?.coverUrl && (
          <div className="absolute inset-0 opacity-[0.14]">
            <img src={featured.coverUrl} alt="" className="h-full w-full scale-110 object-cover blur-2xl" />
          </div>
        )}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_78%_10%,rgba(124,58,237,.2),transparent_42%),linear-gradient(90deg,#11121A_8%,rgba(17,18,26,.91)_50%,rgba(17,18,26,.74))]" />
        <div className="relative grid min-h-[350px] items-center gap-7 p-6 sm:p-9 lg:grid-cols-[minmax(0,1fr)_280px] lg:px-12 lg:py-10">
          <AnimatePresence mode="wait">
            {featured ? (
              <motion.div
                key={featured.id}
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={transition}
                className="max-w-2xl"
              >
                <div className="mb-4 flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-300/20 bg-rose-400/10 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.18em] text-rose-200"><Sparkles className="h-3 w-3" /> Editor spotlight</span>
                  <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-white/35">Selected from live sources</span>
                </div>
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <SeriesFormatBadge series={featured} />
                  {featured.genres.slice(0, 3).map((genre) => <span key={genre} className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[9px] text-white/65">{genre}</span>)}
                </div>
                <h1 className="max-w-xl font-display text-3xl font-black leading-[1.05] tracking-[-0.04em] text-white sm:text-4xl lg:text-[48px]">{featured.title}</h1>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-white/50">
                  <span className="inline-flex items-center gap-1.5 text-amber-200"><Star className="h-3.5 w-3.5 fill-current" />{Number(featured.rating || 0).toFixed(1)}</span>
                  <span>{featured.status}</span><span>{featured.totalChapters} chapters</span><span>{featured.year || '—'}</span>
                </div>
                <p className="mt-4 line-clamp-3 max-w-xl text-xs leading-6 text-white/55 sm:text-sm">{featured.synopsis || `Explore ${featured.title}, a ${getSeriesContentFormat(featured).toLowerCase()} title from ${featured.primarySource}.`}</p>
                <div className="mt-6 flex flex-wrap gap-2.5">
                  <button type="button" onClick={handleFeaturedRead} className="inline-flex items-center gap-2 rounded-lg bg-violet-500 px-4 py-2.5 text-xs font-bold text-white shadow-[0_8px_28px_-12px_rgba(124,58,237,.9)] transition-all hover:-translate-y-0.5 hover:bg-violet-400"><BookOpen className="h-4 w-4" /> Read now</button>
                  <button type="button" onClick={() => onInspectSeries(featured)} className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2.5 text-xs font-semibold text-white/85 transition-colors hover:bg-white/[0.08]">Series details <ChevronRight className="h-4 w-4" /></button>
                </div>
              </motion.div>
            ) : showSkeletons ? (
              <div className="space-y-4" role="status" aria-label="Loading featured series">
                <div className="h-4 w-32 animate-pulse rounded bg-white/10" />
                <div className="h-10 w-3/4 animate-pulse rounded bg-white/10" />
                <div className="h-20 w-full max-w-lg animate-pulse rounded bg-white/[0.06]" />
              </div>
            ) : (
              <div className="max-w-xl"><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-violet-200">Your next chapter starts here</p><h1 className="mt-3 font-display text-4xl font-black tracking-tight text-white">Find a story worth staying up for.</h1><p className="mt-3 max-w-lg text-sm leading-6 text-white/50">Browse live manga, manhwa, and manhua catalogs and keep your reading progress in one place.</p><button type="button" onClick={onBrowseAll} className="mt-6 inline-flex items-center gap-2 rounded-lg bg-violet-500 px-4 py-2.5 text-xs font-bold text-white hover:bg-violet-400">Browse series <ArrowRight className="h-4 w-4" /></button></div>
            )}
          </AnimatePresence>
          {featured && (
            <motion.button
              type="button"
              key={`cover-${featured.id}`}
              onClick={() => onInspectSeries(featured)}
              initial={{ opacity: 0, scale: 0.96, rotate: 2 }}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              transition={transition}
              className="mx-auto hidden w-[200px] overflow-hidden rounded-xl border border-white/10 shadow-[0_25px_80px_-24px_rgba(0,0,0,.95)] lg:block xl:w-[230px]"
              aria-label={`View ${featured.title}`}
            >
              <MangaCoverArt series={featured} className="!aspect-[2/3] !h-auto !w-full !border-0 !p-0" />
            </motion.button>
          )}
        </div>
        {spotlightSeries.length > 1 && (
          <div className="relative flex items-center gap-2 border-t border-white/[0.06] bg-black/15 px-6 py-3 sm:px-9 lg:px-12">
            <span className="mr-2 text-[9px] font-bold uppercase tracking-[0.16em] text-white/35">Spotlight</span>
            {spotlightSeries.map((series, index) => (
              <button key={series.id} type="button" onClick={() => setActiveHeroId(series.id)} aria-label={`Show ${series.title}`} aria-pressed={featured?.id === series.id} className={`relative h-9 w-7 overflow-hidden rounded-md border transition-all ${featured?.id === series.id ? 'border-violet-300/60 opacity-100 ring-2 ring-violet-400/20' : 'border-white/10 opacity-50 hover:opacity-90'}`}>
                <MangaCoverArt series={series} className="!absolute !inset-0 !h-full !w-full !border-0 !p-0" />
                {index === 0 && <span className="sr-only">First featured series</span>}
              </button>
            ))}
          </div>
        )}
      </section>

      <section id="continue-reading" className="scroll-mt-24">
        <SectionTitle eyebrow="Your shelf" title="Continue reading" action="Open library" onAction={onBrowseAll} />
        {recentlyReadEntries.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {recentlyReadEntries.slice(0, 4).map(({ series, progress }) => {
              const percent = progress.totalPages > 0 ? Math.min(100, Math.round((progress.lastPage / progress.totalPages) * 100)) : 0;
              return (
                <motion.button key={series.id} type="button" onClick={() => onResumeSeries(series, progress)} whileHover={{ y: -2 }} className="group flex min-w-0 items-center gap-3 rounded-xl border border-white/[0.07] bg-[#11121A] p-3 text-left transition-colors hover:border-violet-400/25 hover:bg-[#151620]">
                  <div className="relative h-[76px] w-[54px] shrink-0 overflow-hidden rounded-md"><MangaCoverArt series={series} className="!absolute !inset-0 !h-full !w-full !border-0 !p-0" /></div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-white/90">{series.title}</p>
                    <p className="mt-1 truncate text-[10px] text-white/40">Ch. {progress.chapterNumber} · page {progress.lastPage} of {progress.totalPages}</p>
                    <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/[0.08]"><motion.div initial={{ width: 0 }} animate={{ width: `${percent}%` }} transition={transition} className="h-full rounded-full bg-gradient-to-r from-violet-500 to-rose-400" /></div>
                    <p className="mt-1.5 text-[9px] text-white/35">{formatRelativeReadTime(progress.updatedAt)}</p>
                  </div>
                  <Play className="mr-1 h-4 w-4 shrink-0 fill-violet-200 text-violet-200 opacity-0 transition-opacity group-hover:opacity-100" />
                </motion.button>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-dashed border-white/10 bg-white/[0.015] px-5 py-4">
            <div><p className="text-xs font-semibold text-white/80">Your reading progress will appear here.</p><p className="mt-1 text-[10px] text-white/40">Open a title and your exact chapter and page will be saved automatically.</p></div>
            <button type="button" onClick={onBrowseAll} className="rounded-lg border border-white/10 px-3 py-2 text-[10px] font-semibold text-white/70 transition-colors hover:border-violet-300/30 hover:text-white">Find a series</button>
          </div>
        )}
      </section>

      {popularSeries.length > 0 && (
        <section id="popular" className="scroll-mt-24">
          <RankingShelf title="Most popular" eyebrow="The reading list right now" series={popularSeries} bookmarkedIds={bookmarkedIds} onInspectSeries={onInspectSeries} onToggleBookmark={onToggleBookmark} />
        </section>
      )}

      {bookmarkedSeries.length > 0 && (
        <section id="collections" className="scroll-mt-24">
          <RankingShelf title="Most bookmarked" eyebrow={bookmarkedIds.length > 0 ? 'Your personal shelf' : 'Popular picks to start your shelf'} series={bookmarkedSeries} bookmarkedIds={bookmarkedIds} onInspectSeries={onInspectSeries} onToggleBookmark={onToggleBookmark} />
        </section>
      )}

      <section id="trending" className="scroll-mt-24">
        <div className="mb-5 flex items-end justify-between gap-4">
          <div><p className="mb-1 text-[9px] font-bold uppercase tracking-[0.22em] text-rose-300/70">Fresh from the sources</p><h2 className="font-display text-xl font-bold tracking-tight text-[#F5F2FA] sm:text-2xl">Hot updates</h2></div>
          <button type="button" onClick={onBrowseAll} className="group inline-flex items-center gap-1.5 text-[11px] font-semibold text-white/50 hover:text-white">All updates<ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" /></button>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          {recentUpdates.slice(0, 6).map((series) => {
            const chapter = chapterToRead(series);
            return (
              <motion.button key={series.id} type="button" onClick={() => chapter ? onReadChapter(series, chapter) : onInspectSeries(series)} whileHover={{ x: 3 }} className="group flex w-full min-w-0 max-w-full items-center gap-3 overflow-hidden rounded-xl border border-white/[0.06] bg-[#101118] p-3 text-left transition-colors hover:border-white/[0.12] hover:bg-[#14151E]">
                <div className="h-[64px] w-[46px] shrink-0 overflow-hidden rounded-md"><MangaCoverArt series={series} className="!h-full !w-full !border-0 !p-0" /></div>
                <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><SeriesFormatBadge series={series} /><span className="text-[9px] text-white/35">{series.primarySource}</span></div><h3 className="mt-1.5 truncate text-xs font-semibold text-white/85 group-hover:text-white">{series.title}</h3><p className="mt-1 truncate text-[10px] text-white/40">{chapter ? `Chapter ${chapter.number}${chapter.title ? ` · ${chapter.title}` : ''}` : `${series.totalChapters} chapters available`}</p></div>
                <div className="mr-1 flex shrink-0 flex-col items-end gap-1 text-[9px] text-white/35"><span>{chapter?.releaseDate ? formatRelativeReadTime(chapter.releaseDate) : 'Updated'}</span><ChevronRight className="h-4 w-4 text-white/25 transition-transform group-hover:translate-x-0.5 group-hover:text-violet-200" /></div>
              </motion.button>
            );
          })}
        </div>
      </section>

      {topGenres.length > 0 && (
        <section id="top-lists" className="scroll-mt-24">
          <SectionTitle eyebrow="Curated by genre" title="Top lists" action="Explore the catalog" onAction={onBrowseAll} />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {topGenres.map(([genre, items], index) => (
              <motion.button key={genre} type="button" onClick={onBrowseAll} whileHover={{ y: -3 }} className="group relative flex min-h-[166px] items-end overflow-hidden rounded-xl border border-white/[0.07] bg-[#12141D] p-4 text-left">
                <div className="absolute inset-0 flex justify-end overflow-hidden opacity-55 transition-all duration-300 group-hover:opacity-80">
                  {items.slice(0, 3).map((series, coverIndex) => (
                    <div key={series.id} className="absolute top-3 h-[142px] w-[94px] overflow-hidden rounded-lg border border-white/10 shadow-xl transition-transform duration-300" style={{ right: `${coverIndex * 42 + 8}px`, transform: `rotate(${(coverIndex - 1) * 7}deg) translateY(${coverIndex * 2}px)` }}>
                      <MangaCoverArt series={series} className="!h-full !w-full !border-0 !p-0" />
                    </div>
                  ))}
                </div>
                <div className="absolute inset-0 bg-gradient-to-r from-[#101118] via-[#101118]/75 to-transparent" />
                <div className="relative z-10"><span className="text-[9px] font-bold uppercase tracking-[0.18em] text-violet-200/70">Collection 0{index + 1}</span><h3 className="mt-2 max-w-[150px] font-display text-lg font-bold leading-tight text-white">{genre}<br />Essentials</h3><p className="mt-2 text-[10px] text-white/45">{items.length} live titles <ArrowRight className="ml-1 inline h-3 w-3 transition-transform group-hover:translate-x-1" /></p></div>
              </motion.button>
            ))}
          </div>
        </section>
      )}

      <section id="authors" className="scroll-mt-24">
        <SectionTitle eyebrow="Creators to follow" title="Authors & artists" action="Browse all creators" onAction={onBrowseAll} />
        {authors.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
            {authors.map(([author, count], index) => (
              <motion.button key={author} type="button" onClick={onBrowseAll} whileHover={{ y: -3 }} className="rounded-xl border border-white/[0.06] bg-[#101118] p-4 text-left transition-colors hover:border-violet-400/20">
                <div className={`mb-3 grid h-10 w-10 place-items-center rounded-full border border-white/10 text-xs font-bold ${index % 2 ? 'bg-rose-400/10 text-rose-200' : 'bg-violet-400/10 text-violet-200'}`}>{author.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase()}</div>
                <p className="line-clamp-1 text-[11px] font-semibold text-white/85">{author}</p><p className="mt-1 text-[9px] text-white/40">{count} {count === 1 ? 'series' : 'series'}</p>
              </motion.button>
            ))}
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-white/10 p-5 text-xs text-white/40">Live creator credits will appear here as the catalog loads.</p>
        )}
      </section>

      <section id="community" className="scroll-mt-24">
        <div className="mb-5 flex items-end justify-between gap-4"><div><p className="mb-1 text-[9px] font-bold uppercase tracking-[0.22em] text-rose-300/70">The reading room</p><h2 className="font-display text-xl font-bold tracking-tight text-[#F5F2FA] sm:text-2xl">From the community</h2></div><span className="rounded-full border border-white/[0.07] bg-white/[0.025] px-2.5 py-1 text-[9px] font-semibold text-white/40">Community preview</span></div>
        <div className="grid gap-3 lg:grid-cols-3">
          {[
            { icon: MessageCircle, label: 'Weekly thread', title: 'What are you reading this week?', tag: 'OPEN DISCUSSION', tone: 'text-violet-200 bg-violet-400/10' },
            { icon: Heart, label: 'Reader picks', title: 'A series that deserves more attention', tag: 'RECOMMENDATIONS', tone: 'text-rose-200 bg-rose-400/10' },
            { icon: Users, label: 'Reading group', title: 'Join a genre-focused reading circle', tag: 'GROUPS', tone: 'text-emerald-200 bg-emerald-400/10' },
          ].map(({ icon: Icon, label, title, tag, tone }) => (
            <motion.button key={label} type="button" onClick={onBrowseAll} whileHover={{ y: -2 }} className="flex min-h-[150px] flex-col justify-between rounded-xl border border-white/[0.07] bg-[#12141D] p-5 text-left transition-colors hover:border-white/[0.13]">
              <div className="flex items-center justify-between"><span className={`grid h-9 w-9 place-items-center rounded-lg ${tone}`}><Icon className="h-4 w-4" /></span><span className="text-[9px] font-bold tracking-[0.16em] text-white/30">{tag}</span></div>
              <div><p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-white/35">{label}</p><h3 className="mt-1.5 font-display text-base font-semibold text-white/90">{title}</h3></div>
              <span className="flex items-center gap-1 text-[10px] font-semibold text-white/45">Explore titles to discuss <ArrowRight className="h-3 w-3" /></span>
            </motion.button>
          ))}
        </div>
      </section>

      {catalog.length > 0 && (
        <section id="rising" className="scroll-mt-24">
          <SectionTitle eyebrow="Worth a look" title="Rising & fan favorites" action="See all series" onAction={onBrowseAll} />
          <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 lg:grid-cols-5">
            {popularSeries.slice(5, 10).map((series) => (
              <PosterCard key={series.id} series={series} bookmarked={bookmarkedIds.includes(series.id)} onInspect={() => onInspectSeries(series)} onToggleBookmark={() => onToggleBookmark(series.id)} />
            ))}
          </div>
        </section>
      )}

      {showSkeletons && (
        <section aria-label="Loading manga catalog" className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {Array.from({ length: 6 }, (_, index) => <div key={index} className="skeleton-shimmer aspect-[2/3] rounded-xl border border-white/[0.06] bg-[#12141D]" />)}
        </section>
      )}

      <button type="button" onClick={onOpenSearch} className="fixed bottom-6 right-6 z-30 hidden h-12 w-12 place-items-center rounded-full border border-violet-300/25 bg-violet-500 text-white shadow-[0_12px_40px_-10px_rgba(124,58,237,.8)] transition-transform hover:scale-105 lg:grid" aria-label="Open command search">
        <ListFilter className="h-5 w-5" />
      </button>
    </div>
  );
};

