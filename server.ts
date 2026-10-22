import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { fmdEngine } from './src/server/fmdEngine.ts';
import {
  fetchPublicImage,
  MAX_PROXY_IMAGE_BYTES,
  verifyImageProxyRequest,
} from './src/server/imageProxySecurity.ts';
import {
  searchAllLiveFmdSources,
  resolveLiveChaptersForSeries,
  resolveLiveChapterPages,
  verifyFmd2Connectors,
} from './src/server/fmdLiveScraper.ts';
import { createBrowseApiHandler } from './src/server/browseApi.ts';
import {
  DEFAULT_ENABLED_SOURCE_IDS,
  isArchiveFormat,
  type ArchiveFormat,
  type MangaChapter,
  type SourceId,
  type ReadingSessionProgress,
} from './src/utils/fmdLogic.ts';
import {
  getGitHubOAuthAuthorizeUrl,
  exchangeGitHubOAuthCode,
  startGitHubDeviceFlow,
  pollGitHubDeviceFlowToken,
  setGitHubOAuthToken,
  getActiveGitHubToken,
  getGitHubAuthStatus,
  buildProjectReleaseZipBuffer,
  publishReleaseToGitHub,
} from './src/server/githubReleasePublisher.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1');

app.use(express.json({ limit: '5mb' }));

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// ============================================================================
// FMD2 DOWNLOADER ENGINE API ROUTES (Connected to GUI & Live FMD2 Scrapers)
// ============================================================================

app.get('/api/engine/state', (_req, res) => {
  res.json(fmdEngine.getState());
});

app.get('/api/engine/verify-connectors', async (_req, res) => {
  const enabledSources =
    fmdEngine.getState().config.enabledSources || DEFAULT_ENABLED_SOURCE_IDS;
  const statuses = await verifyFmd2Connectors(enabledSources);
  res.json({
    ok: true,
    checkedAt: new Date().toISOString(),
    connectors: statuses,
  });
});

app.post('/api/engine/enqueue-chapters', (req, res) => {
  const { seriesId, seriesTitle, chapters, sourceId, format } = req.body as {
    seriesId?: string;
    seriesTitle?: string;
    chapters?: MangaChapter[];
    sourceId?: SourceId;
    format?: ArchiveFormat;
  };

  const selectedSource = sourceId || 'weebcentral';
  const selectedFormat = format || 'CBZ';
  if (
    !seriesId ||
    !seriesTitle ||
    !Array.isArray(chapters) ||
    chapters.length === 0 ||
    chapters.length > 500 ||
    !chapters.every(
      (chapter) =>
        chapter &&
        typeof chapter.id === 'string' &&
        typeof chapter.title === 'string' &&
        Number.isFinite(chapter.number) &&
        Number.isFinite(chapter.pagesCount) &&
        (chapter.externalId === undefined || typeof chapter.externalId === 'string')
    )
  ) {
    res.status(400).json({ error: 'Provide a valid series and between 1 and 500 chapters.' });
    return;
  }
  if (!DEFAULT_ENABLED_SOURCE_IDS.includes(selectedSource)) {
    res.status(400).json({ error: `Live downloads are not implemented for ${selectedSource}.` });
    return;
  }
  if (!isArchiveFormat(selectedFormat)) {
    res.status(400).json({ error: 'Supported archive formats are CBZ and ZIP.' });
    return;
  }

  try {
    const added = fmdEngine.enqueueChapters(
      { id: seriesId, title: seriesTitle },
      chapters,
      selectedSource,
      selectedFormat
    );
    res.json({
      addedCount: added.length,
      addedTasks: added,
      ...fmdEngine.getState(),
    });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Unable to enqueue.' });
  }
});

app.post('/api/engine/enqueue-url', async (req, res) => {
  const { url, format } = req.body as { url?: string; format?: ArchiveFormat };
  const selectedFormat = format || 'CBZ';
  if (!isArchiveFormat(selectedFormat)) {
    res.status(400).json({ ok: false, message: 'Supported archive formats are CBZ and ZIP.' });
    return;
  }
  const result = await fmdEngine.enqueueDirectUrlAsync(url || '', selectedFormat);
  if (!result.ok) {
    res.status(400).json({
      ok: false,
      message: result.message,
      ...fmdEngine.getState(),
    });
    return;
  }
  res.json({
    ok: true,
    message: result.message,
    series: result.series,
    addedTasks: result.addedTasks || [],
    ...fmdEngine.getState(),
  });
});

app.post('/api/engine/task-control', (req, res) => {
  const { taskId, action } = req.body as {
    taskId?: string;
    action?: 'toggle' | 'remove' | 'retry' | 'completeNow';
  };
  if (!taskId || !action) {
    res.status(400).json({ error: 'Missing taskId or action.' });
    return;
  }
  const nextState = fmdEngine.controlTask(taskId, action);
  res.json(nextState);
});

app.post('/api/engine/batch-control', (req, res) => {
  const { action } = req.body as {
    action?: 'startAll' | 'pauseAll' | 'clearCompleted';
  };
  if (!action) {
    res.status(400).json({ error: 'Missing batch action.' });
    return;
  }
  const nextState = fmdEngine.controlBatch(action);
  res.json(nextState);
});

app.post('/api/engine/config', (req, res) => {
  const nextState = fmdEngine.updateConfig(req.body || {});
  res.json(nextState);
});

app.get('/api/engine/download/:taskId', async (req, res) => {
  try {
    const archive = await fmdEngine.getArchiveForDownloadAsync(req.params.taskId);
    if (!archive) {
      res.status(404).json({ error: 'Archive task not found in FMD2 Engine.' });
      return;
    }
    res.setHeader('Content-Type', archive.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${archive.fileName}"`);
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
    res.setHeader('Content-Length', String(archive.buffer.length));
    res.send(archive.buffer);
  } catch (error) {
    res.status(409).json({
      error: error instanceof Error ? error.message : 'The archive is not ready to download.',
    });
  }
});

// ============================================================================
// CLOUD READING HISTORY SYNC API ROUTES (Cross-Device Session Continuation)
// ============================================================================

const handleGetCloudSync: express.RequestHandler = (req, res) => {
  const syncKey = req.query.syncKey ? String(req.query.syncKey) : undefined;
  const snapshot = fmdEngine.getCloudSyncSnapshot(syncKey);
  res.json({
    ok: true,
    ...snapshot,
    syncedCount: Object.keys(snapshot.readingHistory).length,
    serverTime: new Date().toISOString(),
  });
};

const handlePostCloudSync: express.RequestHandler = (req, res) => {
  const body = (req.body || {}) as {
    syncKey?: string;
    readingHistory?: Record<string, ReadingSessionProgress>;
    entry?: Partial<ReadingSessionProgress>;
    bookmarkedIds?: string[];
    deviceId?: string;
    deviceName?: string;
    mode?: 'merge' | 'overwrite';
    seriesId?: string;
    seriesTitle?: string;
    chapterId?: string;
    chapterNumber?: number;
    chapterTitle?: string;
    sourceId?: SourceId;
    lastPage?: number;
    totalPages?: number;
    updatedAt?: string;
  };

  const singleEntry =
    body.entry ||
    (body.seriesId && body.seriesTitle
      ? {
          seriesId: body.seriesId,
          seriesTitle: body.seriesTitle,
          chapterId: body.chapterId,
          chapterNumber: body.chapterNumber,
          chapterTitle: body.chapterTitle,
          sourceId: body.sourceId,
          lastPage: body.lastPage,
          totalPages: body.totalPages,
          updatedAt: body.updatedAt,
        }
      : undefined);

  const snapshot = fmdEngine.syncReadingHistory({
    syncKey: body.syncKey || (req.query.syncKey ? String(req.query.syncKey) : undefined),
    readingHistory: body.readingHistory,
    entry: singleEntry,
    bookmarkedIds: body.bookmarkedIds,
    deviceId: body.deviceId,
    deviceName: body.deviceName,
    mode: body.mode || 'merge',
  });

  res.json({
    ok: true,
    ...snapshot,
    syncedCount: Object.keys(snapshot.readingHistory).length,
    serverTime: new Date().toISOString(),
  });
};

const handleDeleteCloudSync: express.RequestHandler = (req, res) => {
  const body = (req.body || {}) as {
    syncKey?: string;
    seriesId?: string;
    deviceId?: string;
    deviceName?: string;
  };
  const syncKey = body.syncKey || (req.query.syncKey ? String(req.query.syncKey) : undefined);
  const seriesId = body.seriesId || (req.query.seriesId ? String(req.query.seriesId) : undefined);

  const snapshot = seriesId
    ? fmdEngine.removeCloudReadingSeries(seriesId, syncKey, body.deviceId, body.deviceName)
    : fmdEngine.clearCloudReadingHistory(syncKey, body.deviceId, body.deviceName);

  res.json({
    ok: true,
    ...snapshot,
    syncedCount: Object.keys(snapshot.readingHistory).length,
    serverTime: new Date().toISOString(),
  });
};

app.get(
  ['/api/sync/reading-history', '/api/cloud-sync', '/api/reading-history'],
  handleGetCloudSync
);
app.post(
  ['/api/sync/reading-history', '/api/cloud-sync', '/api/reading-history'],
  handlePostCloudSync
);
app.put(
  ['/api/sync/reading-history', '/api/cloud-sync', '/api/reading-history'],
  handlePostCloudSync
);
app.delete(
  ['/api/sync/reading-history', '/api/cloud-sync', '/api/reading-history'],
  handleDeleteCloudSync
);
app.post('/api/sync/reading-history/clear', handleDeleteCloudSync);

// ============================================================================
// LIVE MULTI-SOURCE FMD2 SCRAPER BROWSE, SEARCH, CHAPTERS & PAGES ROUTES
// ============================================================================

app.get('/api/manga/browse', createBrowseApiHandler());

app.get('/api/manga/live-search', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) {
    res.json({ results: [] });
    return;
  }

  const enabledSources =
    fmdEngine.getState().config.enabledSources || DEFAULT_ENABLED_SOURCE_IDS;

  try {
    const liveScraped = await searchAllLiveFmdSources(q, enabledSources);
    res.json({
      results: liveScraped,
      sourcesQueried: enabledSources,
    });
  } catch {
    res.json({
      results: [],
      sourcesQueried: enabledSources,
    });
  }
});

app.get('/api/manga/chapters', async (req, res) => {
  const title = String(req.query.title || '').trim();
  const sourceId = String(req.query.sourceId || 'weebcentral') as SourceId;
  const seriesId = String(req.query.seriesId || '').trim();
  const slug = String(req.query.slug || '').trim();

  if (!title) {
    res.json({ chapters: [] });
    return;
  }

  try {
    const chapters = await resolveLiveChaptersForSeries(title, sourceId, seriesId, slug);
    res.json({
      sourceId,
      chapters,
    });
  } catch {
    res.json({ sourceId, chapters: [] });
  }
});

app.get('/api/manga/chapter-pages', async (req, res) => {
  const seriesTitle = String(req.query.title || '').trim();
  const chapterNumber = Number(req.query.chapterNumber) || 1;
  const sourceId = String(req.query.sourceId || 'weebcentral') as SourceId;
  const externalId = req.query.externalId ? String(req.query.externalId) : undefined;

  if (!seriesTitle) {
    res.json({ pages: [] });
    return;
  }

  try {
    const data = await resolveLiveChapterPages({
      seriesTitle,
      chapterNumber,
      sourceId,
      externalId,
    });
    res.json({
      sourceId: data.sourceId,
      luaModule: data.luaModule,
      chapterTitle: data.chapterTitle,
      pages: data.pages,
    });
  } catch {
    res.json({ pages: [] });
  }
});

const IMAGE_CACHE_MAX_BYTES = 48 * 1024 * 1024;
let imageRamCacheBytes = 0;
const imageRamCache = new Map<string, { contentType: string; buffer: Buffer; expires: number }>();
const inFlightImages = new Map<string, Promise<{ contentType: string; buffer: Buffer } | null>>();

function storeImageInRam(key: string, contentType: string, buffer: Buffer) {
  const existing = imageRamCache.get(key);
  if (existing) {
    imageRamCacheBytes -= existing.buffer.length;
    imageRamCache.delete(key);
  }

  for (const [cachedKey, cached] of imageRamCache) {
    if (cached.expires <= Date.now()) {
      imageRamCache.delete(cachedKey);
      imageRamCacheBytes -= cached.buffer.length;
    }
  }
  if (buffer.length > IMAGE_CACHE_MAX_BYTES) return;
  while (imageRamCacheBytes + buffer.length > IMAGE_CACHE_MAX_BYTES) {
    const oldest = imageRamCache.entries().next().value as
      | [string, { contentType: string; buffer: Buffer; expires: number }]
      | undefined;
    if (!oldest) break;
    imageRamCache.delete(oldest[0]);
    imageRamCacheBytes -= oldest[1].buffer.length;
  }

  imageRamCache.set(key, {
    contentType,
    buffer,
    expires: Date.now() + 30 * 60 * 1000,
  });
  imageRamCacheBytes += buffer.length;
}

function getCachedImage(key: string) {
  const cached = imageRamCache.get(key);
  if (!cached) return null;
  if (cached.expires <= Date.now()) {
    imageRamCache.delete(key);
    imageRamCacheBytes -= cached.buffer.length;
    return null;
  }
  return cached;
}

app.get('/api/proxy/image', async (req, res) => {
  const rawUrl = String(req.query.url || '').trim();
  const referer = String(req.query.referer || 'https://weebcentral.com/').trim();
  const expiresAt = Number(req.query.expires);
  const signature = String(req.query.signature || '');

  if (!verifyImageProxyRequest(rawUrl, referer, expiresAt, signature)) {
    res.status(403).json({ error: 'Invalid or expired image proxy signature.' });
    return;
  }

  const cacheKey = `${rawUrl}\n${referer}`;
  const cached = getCachedImage(cacheKey);
  if (cached) {
    res.setHeader('Content-Type', cached.contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(cached.buffer);
    return;
  }

  try {
    let inflight = inFlightImages.get(cacheKey);
    if (!inflight) {
      inflight = (async () => {
        try {
          const image = await fetchPublicImage(rawUrl, referer, {
            maxBytes: MAX_PROXY_IMAGE_BYTES,
          });
          storeImageInRam(cacheKey, image.contentType, image.buffer);
          return image;
        } catch {
          return null;
        } finally {
          inFlightImages.delete(cacheKey);
        }
      })();
      inFlightImages.set(cacheKey, inflight);
    }

    const result = await inflight;
    if (!result) {
      res.status(404).end();
      return;
    }
    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(result.buffer);
  } catch {
    res.status(502).end();
  }
});

app.get('/api/proxy/cover', async (req, res) => {
  const { mangaId, fileName } = req.query as { mangaId?: string; fileName?: string };
  if (
    !mangaId ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(mangaId) ||
    !fileName ||
    !/^[a-z0-9._-]{1,128}$/i.test(fileName)
  ) {
    res.status(400).end();
    return;
  }
  const target = `https://uploads.mangadex.org/covers/${mangaId}/${fileName}.256.jpg`;
  const cached = getCachedImage(target);
  if (cached) {
    res.setHeader('Content-Type', cached.contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(cached.buffer);
    return;
  }
  try {
    const image = await fetchPublicImage(target, 'https://mangadex.org/', {
      maxBytes: 2 * 1024 * 1024,
    });
    storeImageInRam(target, image.contentType, image.buffer);
    res.setHeader('Content-Type', image.contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(image.buffer);
  } catch {
    res.status(502).end();
  }
});

// ============================================================================
// HIGH-THINKING MANGA DISCOVERY ROUTE
// ============================================================================

app.post('/api/ai/discover', async (req, res) => {
  const { query } = req.body as { query?: string };
  if (!query || !query.trim()) {
    res.status(400).json({ error: 'Please provide a search or discovery query.' });
    return;
  }

  const ai = getGeminiClient();
  if (ai) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-4-argon',
        contents: `You are an expert manga, manhwa, and scanlation archivist integrated into FMD2 (Free Manga Downloader).
Analyze the user's complex query and provide:
1. A deep editorial synthesis (reading order, thematic connections, source scanlation quality notes).
2. 3 specific recommended titles with their primary FMD2 source module (e.g. LikeManga.ink, Comix.to, WeebCentral, Asura Scans), ideal reading mode (Webtoon vs RTL Single/Double), and reason to read.

User Query: "${query.trim()}"`,
        config: {
          thinkingConfig: {
            thinkingLevel: ThinkingLevel.HIGH,
          },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              synthesis: {
                type: Type.STRING,
                description:
                  'Deep analytical breakdown of the query, reading order, or thematic comparison.',
              },
              recommendations: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    author: { type: Type.STRING },
                    recommendedSource: { type: Type.STRING },
                    readingFormat: { type: Type.STRING },
                    rationale: { type: Type.STRING },
                  },
                  required: [
                    'title',
                    'author',
                    'recommendedSource',
                    'readingFormat',
                    'rationale',
                  ],
                },
              },
            },
            required: ['synthesis', 'recommendations'],
          },
        },
      });

      const rawText = response.text;
      if (rawText) {
        const parsed = JSON.parse(rawText.trim());
        res.json({
          model: 'gemini-4-argon',
          thinkingLevel: 'HIGH',
          ...parsed,
        });
        return;
      }
    } catch (_err) {
      res.status(502).json({ error: 'Upstream Gemini discovery query failed.' });
      return;
    }
  }

  res.status(503).json({
    error: 'Gemini API is not configured in this environment.',
  });
});

// ============================================================================
// GITHUB OAUTH & RELEASE PUBLISHER ROUTES
// ============================================================================

app.get('/api/github/auth/url', (req, res) => {
  const clientOrigin = String(req.query.origin || '').trim() || undefined;
  const result = getGitHubOAuthAuthorizeUrl(clientOrigin);
  res.json(result);
});

app.get(['/auth/github/callback', '/auth/github/callback/'], async (req, res) => {
  const code = String(req.query.code || '').trim();
  if (!code) {
    res.status(400).send('Missing GitHub OAuth authorization code.');
    return;
  }

  try {
    const token = await exchangeGitHubOAuthCode(code);
    setGitHubOAuthToken(token);

    res.setHeader(
      'Set-Cookie',
      `fmd2_gh_token=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=2592000`
    );

    res.send(`<!DOCTYPE html>
<html>
  <head><title>GitHub Connected — FMD2 Studio</title></head>
  <body style="background:#090C12;color:#F8FAFC;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
    <script>
      if (window.opener) {
        window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS', provider: 'github' }, '*');
        window.close();
      } else {
        window.location.href = '/';
      }
    </script>
    <p>GitHub authentication successful. This window will close automatically...</p>
  </body>
</html>`);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'GitHub OAuth failed.';
    res.status(500).send(`<!DOCTYPE html>
<html>
  <body style="background:#090C12;color:#FDA4AF;font-family:system-ui,sans-serif;padding:24px;">
    <h3>GitHub OAuth Error</h3>
    <p>${message}</p>
  </body>
</html>`);
  }
});

app.post('/api/github/device/start', async (_req, res) => {
  const result = await startGitHubDeviceFlow();
  res.status(200).json(result);
});

app.post('/api/github/device/poll', async (req, res) => {
  const deviceCode = String(req.body?.deviceCode || '').trim();
  if (!deviceCode) {
    res.status(200).json({ status: 'expired', error: 'Missing deviceCode.' });
    return;
  }
  const poll = await pollGitHubDeviceFlowToken(deviceCode);
  if (poll.status === 'authorized' && poll.token) {
    setGitHubOAuthToken(poll.token);
    res.setHeader(
      'Set-Cookie',
      `fmd2_gh_token=${encodeURIComponent(poll.token)}; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=2592000`
    );
  }
  res.status(200).json({
    status: poll.status,
    interval: poll.interval,
    error: poll.error,
  });
});

app.get('/api/github/status', async (req, res) => {
  const clientOrigin = String(req.query.origin || '').trim() || undefined;
  const token = getActiveGitHubToken(req.headers.cookie);
  const status = await getGitHubAuthStatus(token, clientOrigin);
  res.json(status);
});

app.post('/api/github/disconnect', (_req, res) => {
  setGitHubOAuthToken(null);
  res.setHeader(
    'Set-Cookie',
    'fmd2_gh_token=; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=0'
  );
  res.json({ ok: true });
});

app.get('/api/github/release-bundle', (req, res) => {
  const tag = String(req.query.tag || 'v2.5.0')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-');
  const zipBytes = buildProjectReleaseZipBuffer(__dirname);
  const fileName = `fmd2-archivist-studio-${tag}-release.zip`;
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.setHeader('Content-Length', String(zipBytes.byteLength));
  res.send(Buffer.from(zipBytes));
});

app.post('/api/github/publish-release', async (req, res) => {
  const token = getActiveGitHubToken(req.headers.cookie);
  if (!token) {
    res.status(200).json({
      ok: false,
      error:
        'GitHub account not connected. Connect your GitHub account via OAuth or configure GITHUB_TOKEN in AI Studio environment variables.',
    });
    return;
  }

  const { repoName, tagName, releaseTitle, releaseNotes, isPrivate, prerelease } =
    (req.body || {}) as {
      repoName?: string;
      tagName?: string;
      releaseTitle?: string;
      releaseNotes?: string;
      isPrivate?: boolean;
      prerelease?: boolean;
    };

  try {
    const result = await publishReleaseToGitHub(__dirname, token, {
      repoName: repoName || 'fmd2-archivist-studio',
      tagName: tagName || 'v2.5.0',
      releaseTitle: releaseTitle || 'FMD2 Archivist Studio v2.5.0',
      releaseNotes: releaseNotes || '',
      isPrivate: Boolean(isPrivate),
      prerelease: Boolean(prerelease),
    });
    res.status(200).json(result);
  } catch (err) {
    res.status(200).json({
      ok: false,
      error:
        err instanceof Error ? err.message : 'Failed to publish release to GitHub.',
    });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, HOST, () => {
    console.log(`FMD2 Studio server running at http://${HOST}:${PORT}`);
  });
}

startServer();
