import type { MangaSeries, DownloadTask } from '../utils/fmdLogic.ts';

/**
 * Catalog and download queue start empty and are populated exclusively
 * from real live upstream FMD2 Lua connectors (/api/manga/browse, /api/manga/live-search, /api/engine).
 */
export const INITIAL_MANGA_CATALOG: MangaSeries[] = [];

export const INITIAL_DOWNLOAD_QUEUE: DownloadTask[] = [];
