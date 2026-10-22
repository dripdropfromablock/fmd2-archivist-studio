import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  FMD2_SOURCE_MODULES,
  DEFAULT_ENABLED_SOURCE_IDS,
  DEFAULT_WEBTOON_TRIGGER_TAGS,
  parseFmdDirectUrl,
  summarizeDownloadQueue,
  buildComicInfoXml,
  buildZipArchiveBuffer,
  DEFAULT_CLOUD_SYNC_KEY,
  isArchiveFormat,
  normalizeCloudSyncKey,
  sanitizeReadingProgressEntry,
  sanitizeReadingHistoryMap,
  mergeReadingHistories,
  mergeBookmarkedIds,
  upsertReadingProgress,
  type DownloadTask,
  type FmdEngineConfig,
  type ArchiveFormat,
  type SourceId,
  type MangaSeries,
  type MangaChapter,
  type ReadingSessionProgress,
  type CloudSyncSnapshot,
} from '../utils/fmdLogic.ts';
import { fetchPublicImage } from './imageProxySecurity.ts';
import {
  resolveLiveChapterPages,
  searchAllLiveFmdSources,
  resolveLiveChaptersForSeries,
} from './fmdLiveScraper.ts';

const DATA_ROOT = process.env.FMD_DATA_DIR?.trim() || path.join(process.cwd(), '.fmd2-data');
const DOWNLOAD_ROOT = path.join(DATA_ROOT, 'downloads');
const CLOUD_SYNC_STORE_PATH = path.join(DATA_ROOT, 'cloud-sync-store.json');
const TASK_STORE_PATH = path.join(DATA_ROOT, 'download-tasks.json');
const MAX_CHAPTER_PAGES = 1000;
const MAX_CHAPTER_ARCHIVE_BYTES = 200 * 1024 * 1024;
const MAX_PAGE_IMAGE_BYTES = 25 * 1024 * 1024;

function ensureDownloadDir() {
  fs.mkdirSync(DOWNLOAD_ROOT, { recursive: true });
}

class FmdDownloaderEngine {
  private tasks: DownloadTask[] = [];
  private config: FmdEngineConfig = {
    maxConcurrentTasks: 3,
    maxThreadsPerTask: 4,
    includeComicInfoXml: true,
    defaultFormat: 'CBZ',
    saveDirectory: DOWNLOAD_ROOT,
    autoDownloadToBrowser: true,
    enabledSources: [...DEFAULT_ENABLED_SOURCE_IDS],
    autoDetectReadingMode: true,
    defaultReadingMode: 'single',
    webtoonTriggerTags: [...DEFAULT_WEBTOON_TRIGGER_TAGS],
  };
  private workerTimer: NodeJS.Timeout | null = null;
  private cloudSyncStore: Record<string, CloudSyncSnapshot> = {};
  private activeTaskControllers = new Map<string, AbortController>();
  private activeTaskPromises = new Map<string, Promise<void>>();

  constructor() {
    ensureDownloadDir();
    this.loadDownloadTasksFromDisk();
    this.loadCloudSyncStoreFromDisk();
    this.startWorkerLoop();
  }

  private loadDownloadTasksFromDisk() {
    try {
      if (!fs.existsSync(TASK_STORE_PATH)) return;
      const parsed = JSON.parse(fs.readFileSync(TASK_STORE_PATH, 'utf-8')) as unknown;
      if (!Array.isArray(parsed)) return;

      this.tasks = parsed
        .filter(
          (task): task is DownloadTask =>
            Boolean(task) &&
            typeof task === 'object' &&
            typeof task.id === 'string' &&
            typeof task.mangaTitle === 'string' &&
            isArchiveFormat(task.format)
        )
        .map((task) => {
          const savePath = this.getDiskFilePath(task);
          const archiveExists = task.status === 'completed' && fs.existsSync(savePath);
          return {
            ...task,
            savePath,
            status: archiveExists ? 'completed' : 'queued',
            archiveReady: archiveExists,
            progress: archiveExists ? 100 : 0,
            pagesDownloaded: archiveExists ? task.totalPages : 0,
            speedKbps: 0,
            lastLog: archiveExists ? task.lastLog : 'Queued after server restart',
          };
        });
      this.persistDownloadTasks();
    } catch (error) {
      console.error('Unable to restore download queue:', error);
    }
  }

  private persistDownloadTasks() {
    try {
      ensureDownloadDir();
      const tempPath = `${TASK_STORE_PATH}.${process.pid}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(this.tasks, null, 2), 'utf-8');
      fs.renameSync(tempPath, TASK_STORE_PATH);
    } catch (error) {
      console.error('Unable to persist download queue:', error);
    }
  }

  private loadCloudSyncStoreFromDisk() {
    try {
      ensureDownloadDir();
      if (fs.existsSync(CLOUD_SYNC_STORE_PATH)) {
        const raw = fs.readFileSync(CLOUD_SYNC_STORE_PATH, 'utf-8');
        const parsed = JSON.parse(raw) as Record<string, CloudSyncSnapshot>;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          for (const [key, snap] of Object.entries(parsed)) {
            if (snap && typeof snap === 'object') {
              const normKey = normalizeCloudSyncKey(snap.syncKey || key);
              this.cloudSyncStore[normKey] = {
                syncKey: normKey,
                readingHistory: sanitizeReadingHistoryMap(snap.readingHistory),
                bookmarkedIds: mergeBookmarkedIds(snap.bookmarkedIds || [], []),
                updatedAt:
                  typeof snap.updatedAt === 'string'
                    ? snap.updatedAt
                    : new Date().toISOString(),
                revision: typeof snap.revision === 'number' ? snap.revision : 1,
                lastDeviceId: snap.lastDeviceId,
                lastDeviceName: snap.lastDeviceName,
              };
            }
          }
        }
      }
    } catch {
      // Ignore corrupt disk cache and start fresh
    }
  }

  private saveCloudSyncStoreToDisk() {
    try {
      ensureDownloadDir();
      const tempPath = `${CLOUD_SYNC_STORE_PATH}.${process.pid}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(this.cloudSyncStore, null, 2), 'utf-8');
      fs.renameSync(tempPath, CLOUD_SYNC_STORE_PATH);
    } catch {
      // Ignore transient disk write errors
    }
  }

  private getDiskFilePath(task: DownloadTask): string {
    const ext = task.format.toLowerCase();
    const safeSeries = `${task.mangaId}_${task.sourceId}_${task.mangaTitle}`
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .slice(0, 120);
    const fileName = `${safeSeries}_Ch_${String(task.chapterNumber).padStart(3, '0')}.${ext}`;
    return path.join(DOWNLOAD_ROOT, fileName);
  }

  /**
   * Synchronous archive packager (packs live fetched image buffers + ComicInfo.xml)
   */
  public materializeArchiveToDiskSync(
    task: DownloadTask,
    liveImageBuffers: { ext: string; data: Uint8Array }[] = []
  ): {
    filePath: string;
    fileName: string;
    bytes: number;
  } {
    if (!isArchiveFormat(task.format)) {
      throw new Error(`Archive format ${String(task.format)} is not supported.`);
    }
    if (liveImageBuffers.length === 0) {
      throw new Error('Cannot create an archive without downloaded chapter pages.');
    }

    ensureDownloadDir();
    const filePath = this.getDiskFilePath(task);
    const fileName = path.basename(filePath);

    const entries: { fileName: string; content: Uint8Array | string }[] = [];
    if (task.format === 'CBZ' && this.config.includeComicInfoXml) {
      entries.push({
        fileName: 'ComicInfo.xml',
        content: buildComicInfoXml({
          mangaTitle: task.mangaTitle,
          chapterNumber: task.chapterNumber,
          chapterTitle: task.chapterTitle,
          sourceId: task.sourceId,
          luaModule: task.luaModule,
          totalPages: liveImageBuffers.length,
        }),
      });
    }

    liveImageBuffers.forEach((img, idx) => {
      entries.push({
        fileName: `${String(idx + 1).padStart(3, '0')}.${img.ext}`,
        content: img.data,
      });
    });

    const archiveBuf = Buffer.from(buildZipArchiveBuffer(entries));

    fs.writeFileSync(filePath, archiveBuf);
    task.archiveReady = true;
    task.bytesWritten = archiveBuf.length;
    task.savePath = filePath;

    return {
      filePath,
      fileName,
      bytes: archiveBuf.length,
    };
  }

  /**
   * Asynchronous live FMD2 scraper packager: fetches real page images from upstream sources
   * and writes the CBZ/ZIP archive to disk.
   */
  public async materializeLiveArchiveAsync(
    task: DownloadTask,
    signal?: AbortSignal
  ): Promise<{
    filePath: string;
    fileName: string;
    bytes: number;
    livePagesCount: number;
  }> {
    if (!isArchiveFormat(task.format)) {
      throw new Error(`Archive format ${String(task.format)} is not supported.`);
    }

    const livePages = await resolveLiveChapterPages({
      seriesTitle: task.mangaTitle,
      chapterNumber: task.chapterNumber,
      sourceId: task.sourceId,
      externalId: task.externalId,
    });
    if (livePages.rawUpstreamPages.length === 0) {
      throw new Error(`No live pages were found for ${task.mangaTitle} chapter ${task.chapterNumber}.`);
    }
    if (livePages.rawUpstreamPages.length > MAX_CHAPTER_PAGES) {
      throw new Error(`Chapter exceeds the ${MAX_CHAPTER_PAGES}-page download limit.`);
    }

    task.totalPages = livePages.rawUpstreamPages.length;
    task.pagesDownloaded = 0;
    task.progress = 0;
    task.bytesWritten = 0;
    task.archiveReady = false;
    task.lastLog = `[${task.luaModule}] Downloading ${task.totalPages} source pages`;

    const fetchedImages: { ext: string; data: Uint8Array }[] = new Array(task.totalPages);
    let nextIndex = 0;
    let totalBytes = 0;
    let failure: Error | null = null;
    const startedAt = Date.now();
    const workerCount = Math.min(
      task.totalPages,
      Math.max(1, Math.min(8, this.config.maxThreadsPerTask))
    );

    const downloadNextPage = async () => {
      while (!failure && !signal?.aborted) {
        const pageIndex = nextIndex++;
        if (pageIndex >= livePages.rawUpstreamPages.length) return;
        const target = livePages.rawUpstreamPages[pageIndex];

        try {
          const image = await fetchPublicImage(target.url, target.referer, {
            signal,
            maxBytes: MAX_PAGE_IMAGE_BYTES,
          });
          const contentType = image.contentType.toLowerCase();
          const ext = contentType.includes('webp')
            ? 'webp'
            : contentType.includes('png')
            ? 'png'
            : contentType.includes('gif')
            ? 'gif'
            : contentType.includes('avif')
            ? 'avif'
            : contentType.includes('jpeg') || contentType.includes('jpg')
            ? 'jpg'
            : null;
          if (!ext) throw new Error(`Unsupported page image type: ${contentType || 'unknown'}.`);

          totalBytes += image.buffer.length;
          if (totalBytes > MAX_CHAPTER_ARCHIVE_BYTES) {
            throw new Error('Chapter exceeds the 200 MB archive size limit.');
          }

          fetchedImages[pageIndex] = { ext, data: image.buffer };
          task.pagesDownloaded++;
          task.progress = Math.round((task.pagesDownloaded / task.totalPages) * 100);
          task.bytesWritten = totalBytes;
          task.sizeMb = Number((totalBytes / (1024 * 1024)).toFixed(1));
          const elapsedSeconds = Math.max(0.25, (Date.now() - startedAt) / 1000);
          task.speedKbps = Math.round(totalBytes / elapsedSeconds / 1024);
          task.lastLog = `[${task.luaModule}] Downloaded page ${task.pagesDownloaded}/${task.totalPages}`;
        } catch (error) {
          failure = error instanceof Error ? error : new Error('Page download failed.');
          return;
        }
      }
    };

    await Promise.all(Array.from({ length: workerCount }, () => downloadNextPage()));
    if (signal?.aborted) throw new Error('Download paused.');
    if (failure) throw failure;
    if (fetchedImages.some((image) => !image)) {
      throw new Error('One or more chapter pages could not be downloaded.');
    }

    const info = this.materializeArchiveToDiskSync(task, fetchedImages);
    task.speedKbps = 0;
    task.archiveReady = true;
    return { ...info, livePagesCount: fetchedImages.length };
  }

  private startWorkerLoop() {
    if (this.workerTimer) clearInterval(this.workerTimer);
    this.workerTimer = setInterval(() => {
      this.tickWorkers();
    }, 650);
    this.workerTimer.unref?.();
  }

  private tickWorkers() {
    let activeCount = this.activeTaskPromises.size;
    let startedTask = false;
    for (const task of this.tasks) {
      if (activeCount >= this.config.maxConcurrentTasks) break;
      if (task.status === 'queued') {
        task.status = 'downloading';
        task.speedKbps = 0;
        task.lastLog = `[${task.luaModule}] Resolving chapter pages`;
        const controller = new AbortController();
        this.activeTaskControllers.set(task.id, controller);
        const run = Promise.resolve()
          .then(() => this.materializeLiveArchiveAsync(task, controller.signal))
          .then((info) => {
            if (task.status === 'paused') return;
            task.status = 'completed';
            task.progress = 100;
            task.pagesDownloaded = info.livePagesCount;
            task.bytesWritten = info.bytes;
            task.savePath = info.filePath;
            task.lastLog = `[${task.luaModule}] Packed ${info.livePagesCount} source pages into ${info.fileName}`;
          })
          .catch((error: unknown) => {
            if (task.status === 'paused') return;
            task.status = 'failed';
            task.speedKbps = 0;
            task.archiveReady = false;
            task.lastLog = error instanceof Error ? error.message : 'Chapter download failed.';
          })
          .finally(() => {
            this.activeTaskControllers.delete(task.id);
            this.activeTaskPromises.delete(task.id);
            this.persistDownloadTasks();
            this.tickWorkers();
          });
        this.activeTaskPromises.set(task.id, run);
        activeCount++;
        startedTask = true;
      }
    }

    if (startedTask) this.persistDownloadTasks();
  }

  private queueTask(task: DownloadTask, logMessage: string) {
    task.status = 'queued';
    task.progress = 0;
    task.pagesDownloaded = 0;
    task.bytesWritten = 0;
    task.speedKbps = 0;
    task.archiveReady = false;
    task.lastLog = logMessage;
  }

  private requeueTask(task: DownloadTask, logMessage: string) {
    const activeAttempt = this.activeTaskPromises.get(task.id);
    if (!activeAttempt) {
      this.queueTask(task, logMessage);
      return;
    }

    // Keep the task paused until the old attempt observes its abort and exits.
    // Otherwise its rejection handler can overwrite the queued state as failed.
    task.status = 'paused';
    task.speedKbps = 0;
    task.lastLog = `[${task.luaModule}] Stopping current attempt before retry`;
    this.activeTaskControllers.get(task.id)?.abort();
    void activeAttempt.finally(() => {
      if (!this.tasks.includes(task) || task.status !== 'paused') return;
      this.queueTask(task, logMessage);
      this.persistDownloadTasks();
      this.tickWorkers();
    });
  }

  public getState() {
    return {
      tasks: this.tasks,
      config: this.config,
      stats: summarizeDownloadQueue(this.tasks),
      cloudSync: this.getCloudSyncSnapshot(DEFAULT_CLOUD_SYNC_KEY),
    };
  }

  public getCloudSyncSnapshot(rawSyncKey?: string): CloudSyncSnapshot {
    const syncKey = normalizeCloudSyncKey(rawSyncKey);
    const existing = this.cloudSyncStore[syncKey];
    if (existing) {
      return existing;
    }
    const created: CloudSyncSnapshot = {
      syncKey,
      readingHistory: {},
      bookmarkedIds: [],
      updatedAt: new Date().toISOString(),
      revision: 1,
    };
    this.cloudSyncStore[syncKey] = created;
    return created;
  }

  public syncReadingHistory(options: {
    syncKey?: string;
    readingHistory?: Record<string, ReadingSessionProgress>;
    entry?: Partial<ReadingSessionProgress>;
    bookmarkedIds?: string[];
    deviceId?: string;
    deviceName?: string;
    mode?: 'merge' | 'overwrite';
  }): CloudSyncSnapshot {
    const syncKey = normalizeCloudSyncKey(options.syncKey);
    const current = this.getCloudSyncSnapshot(syncKey);
    const nowIso = new Date().toISOString();

    let nextHistory: Record<string, ReadingSessionProgress>;
    if (options.mode === 'overwrite' && options.readingHistory) {
      nextHistory = sanitizeReadingHistoryMap(options.readingHistory);
    } else if (options.readingHistory) {
      nextHistory = mergeReadingHistories(current.readingHistory, options.readingHistory);
    } else {
      nextHistory = { ...current.readingHistory };
    }

    if (options.entry) {
      const singleClean = sanitizeReadingProgressEntry({
        ...options.entry,
        deviceId: options.entry.deviceId || options.deviceId,
        deviceName: options.entry.deviceName || options.deviceName,
        syncedAt: nowIso,
      });
      if (singleClean) {
        nextHistory = upsertReadingProgress(nextHistory, singleClean);
      }
    }

    // Stamp syncedAt and device metadata on updated entries
    for (const key of Object.keys(nextHistory)) {
      const item = nextHistory[key];
      nextHistory[key] = {
        ...item,
        deviceId: item.deviceId || options.deviceId || current.lastDeviceId,
        deviceName: item.deviceName || options.deviceName || current.lastDeviceName,
        syncedAt: item.syncedAt || nowIso,
      };
    }

    const nextBookmarks =
      options.mode === 'overwrite' && Array.isArray(options.bookmarkedIds)
        ? mergeBookmarkedIds(options.bookmarkedIds, [])
        : mergeBookmarkedIds(options.bookmarkedIds || [], current.bookmarkedIds);

    const updated: CloudSyncSnapshot = {
      syncKey,
      readingHistory: nextHistory,
      bookmarkedIds: nextBookmarks,
      updatedAt: nowIso,
      revision: (current.revision || 0) + 1,
      lastDeviceId: options.deviceId || current.lastDeviceId || 'fmd2-web-client',
      lastDeviceName: options.deviceName || current.lastDeviceName || 'FMD2 Web Studio',
    };

    this.cloudSyncStore[syncKey] = updated;
    this.saveCloudSyncStoreToDisk();
    return updated;
  }

  public removeCloudReadingSeries(
    seriesId: string,
    rawSyncKey?: string,
    deviceId?: string,
    deviceName?: string
  ): CloudSyncSnapshot {
    const syncKey = normalizeCloudSyncKey(rawSyncKey);
    const current = this.getCloudSyncSnapshot(syncKey);
    const nextHistory = { ...current.readingHistory };
    delete nextHistory[seriesId];

    const updated: CloudSyncSnapshot = {
      ...current,
      readingHistory: nextHistory,
      updatedAt: new Date().toISOString(),
      revision: (current.revision || 0) + 1,
      lastDeviceId: deviceId || current.lastDeviceId,
      lastDeviceName: deviceName || current.lastDeviceName,
    };
    this.cloudSyncStore[syncKey] = updated;
    this.saveCloudSyncStoreToDisk();
    return updated;
  }

  public clearCloudReadingHistory(
    rawSyncKey?: string,
    deviceId?: string,
    deviceName?: string
  ): CloudSyncSnapshot {
    const syncKey = normalizeCloudSyncKey(rawSyncKey);
    const current = this.getCloudSyncSnapshot(syncKey);
    const updated: CloudSyncSnapshot = {
      ...current,
      readingHistory: {},
      updatedAt: new Date().toISOString(),
      revision: (current.revision || 0) + 1,
      lastDeviceId: deviceId || current.lastDeviceId,
      lastDeviceName: deviceName || current.lastDeviceName,
    };
    this.cloudSyncStore[syncKey] = updated;
    this.saveCloudSyncStoreToDisk();
    return updated;
  }

  public updateConfig(partial: Partial<FmdEngineConfig>) {
    if (typeof partial.maxConcurrentTasks === 'number' && Number.isFinite(partial.maxConcurrentTasks)) {
      this.config.maxConcurrentTasks = Math.max(1, Math.min(6, partial.maxConcurrentTasks));
    }
    if (typeof partial.maxThreadsPerTask === 'number' && Number.isFinite(partial.maxThreadsPerTask)) {
      this.config.maxThreadsPerTask = Math.max(1, Math.min(8, partial.maxThreadsPerTask));
    }
    if (typeof partial.includeComicInfoXml === 'boolean') {
      this.config.includeComicInfoXml = partial.includeComicInfoXml;
    }
    if (typeof partial.autoDownloadToBrowser === 'boolean') {
      this.config.autoDownloadToBrowser = partial.autoDownloadToBrowser;
    }
    if (isArchiveFormat(partial.defaultFormat)) {
      this.config.defaultFormat = partial.defaultFormat;
    }
    if (Array.isArray(partial.enabledSources)) {
      const supportedSources = partial.enabledSources.filter(
        (sourceId): sourceId is SourceId =>
          typeof sourceId === 'string' && DEFAULT_ENABLED_SOURCE_IDS.includes(sourceId)
      );
      if (supportedSources.length > 0) this.config.enabledSources = supportedSources;
    }
    if (typeof partial.autoDetectReadingMode === 'boolean') {
      this.config.autoDetectReadingMode = partial.autoDetectReadingMode;
    }
    if (partial.defaultReadingMode) {
      this.config.defaultReadingMode = partial.defaultReadingMode;
    }
    if (Array.isArray(partial.webtoonTriggerTags)) {
      this.config.webtoonTriggerTags = partial.webtoonTriggerTags;
    }
    return this.getState();
  }

  public enqueueChapters(
    series: Pick<MangaSeries, 'id' | 'title'>,
    chapters: MangaChapter[],
    sourceId: SourceId,
    format: ArchiveFormat
  ): DownloadTask[] {
    if (!DEFAULT_ENABLED_SOURCE_IDS.includes(sourceId)) {
      throw new Error(`Live downloads are not implemented for source ${sourceId}.`);
    }
    if (!isArchiveFormat(format)) {
      throw new Error(`Archive format ${String(format)} is not supported.`);
    }

    const mod = FMD2_SOURCE_MODULES.find((m) => m.id === sourceId) || FMD2_SOURCE_MODULES[0];
    const nowTime = new Date().toTimeString().slice(0, 8);

    const created: DownloadTask[] = chapters.map((ch) => {
      const totalPages = ch.pagesCount || 18;
      const task: DownloadTask = {
        id: `dl-${randomUUID()}`,
        mangaId: series.id,
        mangaTitle: series.title,
        chapterId: ch.id,
        chapterNumber: ch.number,
        chapterTitle: ch.title,
        externalId: ch.externalId,
        sourceId,
        luaModule: mod.luaModule,
        format,
        status: 'queued',
        progress: 0,
        pagesDownloaded: 0,
        totalPages,
        speedKbps: 0,
        sizeMb: Number((14 + (ch.number % 9) * 1.4).toFixed(1)),
        addedAt: nowTime,
        savePath: '',
        archiveReady: false,
        lastLog: `[${mod.luaModule}] Queued for extraction (${format})`,
      };
      task.savePath = this.getDiskFilePath(task);
      return task;
    });

    this.tasks = [...created, ...this.tasks];
    this.persistDownloadTasks();
    this.tickWorkers();
    return created;
  }

  public async enqueueDirectUrlAsync(
    rawUrl: string,
    format: ArchiveFormat
  ): Promise<{
    ok: boolean;
    message: string;
    series?: MangaSeries;
    addedTasks?: DownloadTask[];
  }> {
    const parsed = parseFmdDirectUrl(rawUrl);
    if (!parsed.isValid || !parsed.sourceId) {
      return {
        ok: false,
        message: parsed.error || 'Invalid URL. Please enter a supported manga URL.',
      };
    }

    const searchMatches = await searchAllLiveFmdSources(parsed.extractedQuery, [
      parsed.sourceId,
      ...this.config.enabledSources,
    ]);

    const targetSeries = searchMatches[0];
    if (!targetSeries) {
      return {
        ok: false,
        message: `Could not resolve "${parsed.extractedQuery}" from live FMD2 source (${parsed.luaModule}).`,
      };
    }

    const liveChapters = await resolveLiveChaptersForSeries(
      targetSeries.title,
      parsed.sourceId,
      targetSeries.id,
      targetSeries.slug
    );
    if (liveChapters.length > 0) {
      targetSeries.chapters = liveChapters;
      targetSeries.totalChapters = Math.max(targetSeries.totalChapters, liveChapters.length);
    }

    const chaptersToQueue = targetSeries.chapters.slice(0, 2);
    if (chaptersToQueue.length === 0) {
      return {
        ok: false,
        message: `No chapters found for "${targetSeries.title}" on ${parsed.luaModule}.`,
      };
    }

    const addedTasks = this.enqueueChapters(
      targetSeries,
      chaptersToQueue,
      parsed.sourceId,
      format
    );

    return {
      ok: true,
      message: `FMD2 Engine resolved "${targetSeries.title}" via ${parsed.luaModule} — Queued ${addedTasks.length} chapters for download (${format}).`,
      series: targetSeries,
      addedTasks,
    };
  }

  public controlTask(taskId: string, action: 'toggle' | 'remove' | 'retry' | 'completeNow') {
    if (action === 'remove') {
      this.activeTaskControllers.get(taskId)?.abort();
      this.tasks = this.tasks.filter((t) => t.id !== taskId);
      this.persistDownloadTasks();
      return this.getState();
    }

    const task = this.tasks.find((t) => t.id === taskId);
    if (!task) return this.getState();

    if (action === 'toggle') {
      if (task.status === 'downloading') {
        task.status = 'paused';
        this.activeTaskControllers.get(taskId)?.abort();
        task.speedKbps = 0;
        task.lastLog = `[${task.luaModule}] Paused by user at page ${task.pagesDownloaded}/${task.totalPages}`;
      } else if (
        task.status === 'paused' ||
        task.status === 'queued' ||
        task.status === 'failed'
      ) {
        this.requeueTask(task, `[${task.luaModule}] Requeued for download`);
      }
    } else if (action === 'retry' || action === 'completeNow') {
      if (task.status !== 'completed') {
        this.requeueTask(task, `[${task.luaModule}] Requeued for download`);
      }
    }

    this.persistDownloadTasks();
    this.tickWorkers();
    return this.getState();
  }

  public controlBatch(action: 'startAll' | 'pauseAll' | 'clearCompleted') {
    if (action === 'clearCompleted') {
      this.tasks = this.tasks.filter((t) => t.status !== 'completed');
    } else if (action === 'pauseAll') {
      for (const t of this.tasks) {
        if (t.status === 'downloading' || t.status === 'queued') {
          t.status = 'paused';
          this.activeTaskControllers.get(t.id)?.abort();
          t.speedKbps = 0;
          t.lastLog = `[${t.luaModule}] Paused by batch command`;
        }
      }
    } else if (action === 'startAll') {
      for (const t of this.tasks) {
        if (t.status === 'paused' || t.status === 'queued') {
          this.requeueTask(t, `[${t.luaModule}] Requeued by Start All`);
        }
      }
    }
    this.persistDownloadTasks();
    this.tickWorkers();
    return this.getState();
  }

  public async getArchiveForDownloadAsync(taskId: string): Promise<{
    buffer: Buffer;
    fileName: string;
    mimeType: string;
  } | null> {
    const task = this.tasks.find((t) => t.id === taskId);
    if (!task) return null;

    while (task.status === 'queued' || task.status === 'downloading') {
      const running = this.activeTaskPromises.get(taskId);
      if (running) {
        await running;
      } else {
        this.tickWorkers();
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    if (task.status !== 'completed' || !task.archiveReady || !fs.existsSync(task.savePath)) {
      throw new Error(task.lastLog || 'The archive is not ready to download.');
    }

    const buffer = fs.readFileSync(task.savePath);
    const fileName = path.basename(task.savePath);
    const mimeType =
      task.format === 'CBZ'
        ? 'application/vnd.comicbook+zip'
        : 'application/zip';

    return {
      buffer,
      fileName,
      mimeType,
    };
  }
}

export const fmdEngine = new FmdDownloaderEngine();
