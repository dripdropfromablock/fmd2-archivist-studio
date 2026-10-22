import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { BookOpen, Search, UserRound, Users, X } from 'lucide-react';
import type { MangaSeries } from '../utils/fmdLogic.ts';
import { MangaCoverArt } from './MangaArtRenderer.tsx';

type SearchScope = 'series' | 'users' | 'authors';

interface CommandPaletteProps {
  open: boolean;
  catalog: MangaSeries[];
  onClose: () => void;
  onInspectSeries: (series: MangaSeries) => void;
  onSearchAuthor: (author: string) => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  open,
  catalog,
  onClose,
  onInspectSeries,
  onSearchAuthor,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [scope, setScope] = useState<SearchScope>('series');
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setDebouncedQuery('');
    setActiveIndex(0);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedQuery(query.trim().toLowerCase()), 140);
    return () => window.clearTimeout(timeout);
  }, [query]);

  const seriesResults = useMemo(() => {
    if (!debouncedQuery) return catalog.slice(0, 8);
    return catalog
      .filter((series) =>
        [series.title, series.author, ...series.altTitles]
          .filter(Boolean)
          .some((value) => value.toLowerCase().includes(debouncedQuery))
      )
      .slice(0, 8);
  }, [catalog, debouncedQuery]);

  const authorResults = useMemo(() => {
    const names = [...new Set(catalog.map((series) => series.author).filter((name) => name && name !== 'Unknown'))];
    return names
      .filter((name) => !debouncedQuery || name.toLowerCase().includes(debouncedQuery))
      .slice(0, 8);
  }, [catalog, debouncedQuery]);

  const resultCount = scope === 'series' ? seriesResults.length : scope === 'authors' ? authorResults.length : 0;

  useEffect(() => {
    setActiveIndex(0);
  }, [scope, debouncedQuery]);

  const chooseActive = () => {
    if (scope === 'series' && seriesResults[activeIndex]) {
      onInspectSeries(seriesResults[activeIndex]);
      onClose();
    } else if (scope === 'authors' && authorResults[activeIndex]) {
      onSearchAuthor(authorResults[activeIndex]);
      onClose();
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => resultCount > 0 ? (index + 1) % resultCount : 0);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => resultCount > 0 ? (index - 1 + resultCount) % resultCount : 0);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      chooseActive();
    } else if (event.key === 'Tab') {
      event.preventDefault();
      const scopes: SearchScope[] = ['series', 'users', 'authors'];
      setScope(scopes[(scopes.indexOf(scope) + 1) % scopes.length]);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-start justify-center bg-black/65 px-4 pt-[12vh] backdrop-blur-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
        >
          <motion.section
            role="dialog"
            aria-modal="true"
            aria-label="Global search"
            initial={{ opacity: 0, y: -12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.99 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-[620px] overflow-hidden rounded-2xl border border-white/10 bg-[#101118] shadow-[0_30px_100px_rgba(0,0,0,.75)]"
          >
            <div className="flex items-center gap-3 border-b border-white/[0.07] px-4 py-4 sm:px-5">
              <Search className="h-5 w-5 shrink-0 text-violet-300" />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={`Search ${scope}…`}
                aria-label={`Search ${scope}`}
                className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/30"
              />
              <kbd className="hidden rounded-md border border-white/10 bg-white/[0.03] px-1.5 py-1 text-[9px] text-white/40 sm:block">ESC</kbd>
              <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-white/40 transition-colors hover:bg-white/[0.06] hover:text-white" aria-label="Close search"><X className="h-4 w-4" /></button>
            </div>
            <div className="flex gap-1 border-b border-white/[0.06] px-4 py-2 sm:px-5" role="tablist" aria-label="Search scope">
              {([
                ['series', BookOpen, 'Series'],
                ['users', Users, 'Users'],
                ['authors', UserRound, 'Authors'],
              ] as const).map(([key, Icon, label]) => (
                <button key={key} type="button" role="tab" aria-selected={scope === key} onClick={() => setScope(key)} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[10px] font-semibold transition-colors ${scope === key ? 'bg-violet-500/15 text-violet-100' : 'text-white/40 hover:bg-white/[0.04] hover:text-white/75'}`}>
                  <Icon className="h-3.5 w-3.5" />{label}
                </button>
              ))}
              <span className="ml-auto self-center text-[9px] text-white/30">↑ ↓ navigate · ↵ open · Tab switch</span>
            </div>
            <div className="max-h-[min(60vh,480px)] overflow-y-auto p-2" role="listbox" aria-label={`${scope} results`}>
              {scope === 'series' && seriesResults.map((series, index) => (
                <button key={series.id} type="button" role="option" aria-selected={activeIndex === index} onMouseEnter={() => setActiveIndex(index)} onClick={() => { onInspectSeries(series); onClose(); }} className={`flex w-full items-center gap-3 rounded-xl p-2.5 text-left transition-colors ${activeIndex === index ? 'bg-white/[0.06]' : 'hover:bg-white/[0.04]'}`}>
                  <span className="h-12 w-9 shrink-0 overflow-hidden rounded-md"><MangaCoverArt series={series} className="!h-full !w-full !border-0 !p-0" /></span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-white/90">{series.title}</span><span className="mt-1 block truncate text-[10px] text-white/40">{series.author} · {series.status} · {series.totalChapters} chapters</span></span>
                  <BookOpen className="h-4 w-4 shrink-0 text-white/25" />
                </button>
              ))}
              {scope === 'authors' && authorResults.map((author, index) => (
                <button key={author} type="button" role="option" aria-selected={activeIndex === index} onMouseEnter={() => setActiveIndex(index)} onClick={() => { onSearchAuthor(author); onClose(); }} className={`flex w-full items-center gap-3 rounded-xl p-3 text-left transition-colors ${activeIndex === index ? 'bg-white/[0.06]' : 'hover:bg-white/[0.04]'}`}>
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-violet-400/10 text-xs font-bold text-violet-100">{author.slice(0, 1).toUpperCase()}</span><span className="flex-1 text-xs font-semibold text-white/85">{author}</span><span className="text-[9px] text-white/35">Creator</span>
                </button>
              ))}
              {scope === 'users' && (
                <div className="px-6 py-10 text-center"><Users className="mx-auto h-6 w-6 text-white/20" /><p className="mt-3 text-xs font-semibold text-white/65">Community profiles are not connected yet.</p><p className="mt-1 text-[10px] text-white/35">Search and creator discovery work with your live catalog.</p></div>
              )}
              {scope !== 'users' && resultCount === 0 && <p className="px-6 py-10 text-center text-xs text-white/40">No {scope} match “{query}”.</p>}
            </div>
            <div className="flex items-center justify-between border-t border-white/[0.06] px-4 py-3 text-[9px] text-white/30 sm:px-5"><span>FMD2 Studio search</span><span>{resultCount} results</span></div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

