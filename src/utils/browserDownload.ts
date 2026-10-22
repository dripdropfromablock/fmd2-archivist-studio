import type {
  ArchiveFormat,
  DownloadTask,
  MangaChapter,
  MangaSeries,
  SourceId,
} from './fmdLogic.ts';

export interface BrowserDownloadResult {
  ok: boolean;
  fileName: string;
  bytes: number;
  error?: string;
}

/**
 * Fetches the packed archive (.cbz, .pdf, .zip, .epub) from the FMD2 server engine
 * as a Blob and triggers an immediate native browser file save dialog.
 * Using Blob + URL.createObjectURL works reliably inside cross-origin preview iframes.
 */
export async function triggerBrowserFileDownload(
  task: Pick<DownloadTask, 'id' | 'mangaTitle' | 'chapterNumber' | 'format'>
): Promise<BrowserDownloadResult> {
  const ext = task.format.toLowerCase();
  const fallbackName = `${task.mangaTitle.replace(/[^a-zA-Z0-9_-]+/g, '_')}_Ch_${String(
    task.chapterNumber
  ).padStart(3, '0')}.${ext}`;

  try {
    const res = await fetch(`/api/engine/download/${encodeURIComponent(task.id)}`);
    if (!res.ok) {
      return {
        ok: false,
        fileName: fallbackName,
        bytes: 0,
        error: `FMD2 Engine returned status ${res.status}`,
      };
    }

    const disposition = res.headers.get('Content-Disposition') || '';
    const nameMatch = disposition.match(/filename="([^"]+)"/i);
    const resolvedFileName = nameMatch ? nameMatch[1] : fallbackName;

    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);

    const anchor = document.createElement('a');
    anchor.href = blobUrl;
    anchor.download = resolvedFileName;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    setTimeout(() => {
      URL.revokeObjectURL(blobUrl);
    }, 8000);

    return {
      ok: true,
      fileName: resolvedFileName,
      bytes: blob.size,
    };
  } catch (err) {
    return {
      ok: false,
      fileName: fallbackName,
      bytes: 0,
      error: err instanceof Error ? err.message : 'Download failed',
    };
  }
}

/**
 * Enqueues chapters in the FMD2 server engine and optionally waits for completed
 * archives to trigger browser file downloads for the user.
 */
export async function enqueueAndDownloadChapters(params: {
  series: Pick<MangaSeries, 'id' | 'title'>;
  chapters: MangaChapter[];
  sourceId: SourceId;
  format: ArchiveFormat;
  triggerBrowserSave?: boolean;
}): Promise<{
  ok: boolean;
  addedTasks: DownloadTask[];
  allTasks: DownloadTask[];
  downloadedFiles: string[];
}> {
  try {
    const res = await fetch('/api/engine/enqueue-chapters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        seriesId: params.series.id,
        seriesTitle: params.series.title,
        chapters: params.chapters,
        sourceId: params.sourceId,
        format: params.format,
      }),
    });

    if (!res.ok) {
      return { ok: false, addedTasks: [], allTasks: [], downloadedFiles: [] };
    }

    const data = (await res.json()) as {
      addedTasks?: DownloadTask[];
      tasks?: DownloadTask[];
    };

    const addedTasks = Array.isArray(data.addedTasks) ? data.addedTasks : [];
    const allTasks = Array.isArray(data.tasks) ? data.tasks : [];
    const downloadedFiles: string[] = [];

    if (params.triggerBrowserSave !== false && addedTasks.length > 0) {
      // Trigger browser file save for up to 3 selected chapters so the browser doesn't block popups
      for (const task of addedTasks.slice(0, 3)) {
        const dl = await triggerBrowserFileDownload(task);
        if (dl.ok) {
          downloadedFiles.push(dl.fileName);
        }
      }
    }

    return {
      ok: true,
      addedTasks,
      allTasks,
      downloadedFiles,
    };
  } catch {
    return { ok: false, addedTasks: [], allTasks: [], downloadedFiles: [] };
  }
}
