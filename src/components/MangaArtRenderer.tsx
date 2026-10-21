import React, { useState, useEffect } from 'react';
import { BookOpen } from 'lucide-react';
import type { MangaSeries } from '../utils/fmdLogic.ts';

interface MangaCoverArtProps {
  series?: MangaSeries;
  theme?: MangaSeries['coverTheme'];
  title?: string;
  subtitle?: string;
  coverUrl?: string;
  className?: string;
}

/**
 * Renders live upstream manga cover art (`series.coverUrl` or `coverUrl`).
 * When an upstream cover image is still loading or unavailable, displays a clean
 * typographical Tankōbon spine/cover placeholder without any fabricated mock artwork.
 */
export const MangaCoverArt: React.FC<MangaCoverArtProps> = React.memo(({
  series,
  title,
  subtitle,
  coverUrl,
  className = '',
}) => {
  const resolvedCoverUrl = coverUrl ?? series?.coverUrl;
  const resolvedTitle = title ?? series?.title ?? 'Manga Series';
  const resolvedSubtitle =
    subtitle ?? (series ? `${series.demographic} · ${series.status}` : 'Tankōbon Volume');

  const [imgFailed, setImgFailed] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);

  useEffect(() => {
    setImgFailed(false);
    setImgLoaded(false);
  }, [resolvedCoverUrl]);

  return (
    <div
      className={`tankobon-volume-frame relative overflow-hidden select-none bg-[#0B0F17] flex flex-col justify-between p-4 border border-slate-800/80 ${className}`}
      aria-label={`${resolvedTitle} cover`}
    >
      {!imgLoaded && (
        <>
          <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-slate-500 pl-2">
            <span>TANKŌBON</span>
            <BookOpen className="w-3.5 h-3.5 text-slate-500" />
          </div>

          <div className="my-auto py-2 pl-2">
            <div className="text-xs font-bold text-slate-100 font-display line-clamp-3 leading-snug">
              {resolvedTitle}
            </div>
            {resolvedSubtitle && (
              <div className="text-[10px] font-mono text-slate-400 mt-1.5 truncate">
                {resolvedSubtitle}
              </div>
            )}
          </div>

          <div className="text-[9px] font-mono text-slate-500 uppercase tracking-widest border-t border-slate-800/80 pt-2 pl-2">
            Live FMD2 Archive
          </div>
        </>
      )}

      {resolvedCoverUrl && !imgFailed && (
        <>
          <img
            src={resolvedCoverUrl}
            alt={`${resolvedTitle} cover`}
            referrerPolicy="no-referrer"
            loading="lazy"
            decoding="async"
            onLoad={() => setImgLoaded(true)}
            onError={() => setImgFailed(true)}
            className={`absolute inset-0 w-full h-full object-cover object-center transition-opacity duration-200 ${
              imgLoaded ? 'opacity-100' : 'opacity-0'
            }`}
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 to-transparent" />
        </>
      )}
    </div>
  );
});

