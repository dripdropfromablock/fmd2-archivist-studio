import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { fmdEngine } from './src/server/fmdEngine.ts';
import {
  browseLiveFmdSources,
  searchAllLiveFmdSources,
  resolveLiveChaptersForSeries,
  resolveLiveChapterPages,
  verifyFmd2Connectors,
} from './src/server/fmdLiveScraper.ts';
import {
  DEFAULT_ENABLED_SOURCE_IDS,
  type ArchiveFormat,
  type MangaChapter,
  type SourceId,
  type BrowseSortOption,
  type BrowseStatusFilter,
  type BrowseFormatFilter,
  type BrowseDemographicFilter,
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

process.on('unhandledRejection', () => {
  // Prevent transient upstream scraper timeouts from terminating the dev server
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught server exception:', err?.message || err);
});

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
  const { seriesId, seriesTitle, chapters, sourceId, format, completeImmediately } = req.body as {
    seriesId?: string;
    seriesTitle?: string;
    chapters?: MangaChapter[];
    sourceId?: SourceId;
    format?: ArchiveFormat;
    completeImmediately?: boolean;
  };

  if (!seriesId || !seriesTitle || !Array.isArray(chapters) || chapters.length === 0) {
    res.status(400).json({ error: 'Missing series or chapters to enqueue.' });
    return;
  }

  const added = fmdEngine.enqueueChapters(
    { id: seriesId, title: seriesTitle },
    chapters,
    sourceId || 'weebcentral',
    format || 'CBZ',
    completeImmediately !== false
  );
  res.json({
    addedCount: added.length,
    addedTasks: added,
    ...fmdEngine.getState(),
  });
});

app.post('/api/engine/enqueue-url', async (req, res) => {
  const { url, format } = req.body as { url?: string; format?: ArchiveFormat };
  const result = await fmdEngine.enqueueDirectUrlAsync(url || '', format || 'CBZ');
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

app.get('/api/manga/browse', async (req, res) => {
  const sourceId = String(req.query.sourceId || 'ALL') as SourceId | 'ALL';
  const query = String(req.query.q || '').trim();
  const sortBy = String(req.query.sortBy || 'popular') as BrowseSortOption;
  const status = String(req.query.status || 'All') as BrowseStatusFilter;
  const format = String(req.query.format || 'All') as BrowseFormatFilter;
  const demographic = String(req.query.demographic || 'All') as BrowseDemographicFilter;
  const minChapters = Number(req.query.minChapters) || 0;
  const page = Math.max(1, Number(req.query.page) || 1);
  const forceRefresh = req.query.refresh === '1' || req.query.refresh === 'true';

  try {
    const data = await browseLiveFmdSources({
      sourceId,
      query,
      sortBy,
      status,
      format,
      demographic,
      minChapters,
      page,
      forceRefresh,
    });
    res.json({
      ok: true,
      sourceId,
      page,
      fetchedAt: new Date().toISOString(),
      sourcesQueried: data.sourcesQueried,
      results: data.results,
    });
  } catch {
    res.json({
      ok: false,
      sourceId,
      page,
      fetchedAt: new Date().toISOString(),
      sourcesQueried: [],
      results: [],
    });
  }
});

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

const imageRamCache = new Map<string, { contentType: string; buffer: Buffer; expires: number }>();
const inFlightImages = new Map<string, Promise<{ contentType: string; buffer: Buffer } | null>>();

function storeImageInRam(key: string, contentType: string, buffer: Buffer) {
  if (buffer.length > 2_500_000) return; // Skip caching abnormally huge single images >2.5MB
  if (imageRamCache.size >= 180) {
    const oldestKey = imageRamCache.keys().next().value;
    if (oldestKey) imageRamCache.delete(oldestKey);
  }
  imageRamCache.set(key, {
    contentType,
    buffer,
    expires: Date.now() + 30 * 60 * 1000,
  });
}

app.get('/api/proxy/image', async (req, res) => {
  const rawUrl = String(req.query.url || '').trim();
  const referer = String(req.query.referer || 'https://weebcentral.com/').trim();

  if (!rawUrl || !/^https?:\/\//i.test(rawUrl)) {
    res.status(400).end();
    return;
  }

  const cached = imageRamCache.get(rawUrl);
  if (cached && cached.expires > Date.now()) {
    res.setHeader('Content-Type', cached.contentType);
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    res.send(cached.buffer);
    return;
  }

  try {
    let inflight = inFlightImages.get(rawUrl);
    if (!inflight) {
      inflight = (async () => {
        try {
          const upstream = await fetch(rawUrl, {
            headers: {
              Referer: referer,
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
            },
            signal: AbortSignal.timeout(5000),
          });
          if (!upstream.ok) return null;
          const contentType = upstream.headers.get('content-type') || 'image/jpeg';
          const arrayBuffer = await upstream.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          storeImageInRam(rawUrl, contentType, buffer);
          return { contentType, buffer };
        } catch {
          return null;
        } finally {
          inFlightImages.delete(rawUrl);
        }
      })();
      inFlightImages.set(rawUrl, inflight);
    }

    const result = await inflight;
    if (!result) {
      res.status(404).end();
      return;
    }
    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    res.send(result.buffer);
  } catch {
    res.status(404).end();
  }
});

app.get('/api/proxy/cover', async (req, res) => {
  const { mangaId, fileName } = req.query as { mangaId?: string; fileName?: string };
  if (!mangaId || !fileName) {
    res.status(404).end();
    return;
  }
  const target = `https://uploads.mangadex.org/covers/${mangaId}/${fileName}.256.jpg`;
  const cached = imageRamCache.get(target);
  if (cached && cached.expires > Date.now()) {
    res.setHeader('Content-Type', cached.contentType);
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    res.send(cached.buffer);
    return;
  }
  try {
    const upstream = await fetch(target, {
      headers: { 'User-Agent': 'FMD2-Studio/2.0' },
      signal: AbortSignal.timeout(4500),
    });
    if (!upstream.ok) {
      res.status(404).end();
      return;
    }
    const contentType = upstream.headers.get('content-type') || 'image/jpeg';
    const arrayBuffer = await upstream.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    storeImageInRam(target, contentType, buffer);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    res.send(buffer);
  } catch {
    res.status(404).end();
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
  const tag = String(req.query.tag || 'v2.4.0')
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
      tagName: tagName || 'v2.4.0',
      releaseTitle: releaseTitle || 'FMD2 Archivist Studio v2.4.0',
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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`FMD2 Studio server running at http://localhost:${PORT}`);
  });
}

startServer();
