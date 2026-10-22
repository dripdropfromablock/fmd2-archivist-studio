import assert from 'node:assert/strict';
import express from 'express';
import test from 'node:test';
import { createBrowseApiHandler } from './browseApi.ts';
import type { LiveBrowseParams, LiveBrowseResult } from './fmdLiveScraper.ts';

type BrowseService = (params: LiveBrowseParams) => Promise<LiveBrowseResult>;

async function requestBrowse(
  service: BrowseService,
  query: string
): Promise<{ status: number; body: any }> {
  const app = express();
  app.get('/api/manga/browse', createBrowseApiHandler(service));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });

  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const response = await fetch(`http://127.0.0.1:${address.port}/api/manga/browse?${query}`);
    return { status: response.status, body: await response.json() };
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

test('browse API parses filters and returns per-source outcomes', async () => {
  let received: LiveBrowseParams | undefined;
  const service: BrowseService = async (params) => {
    received = params;
    return {
      results: [],
      sourcesQueried: ['mangadex'],
      sourceOutcomes: [
        {
          sourceId: 'mangadex',
          outcome: 'empty',
          latencyMs: 17,
          resultCount: 0,
          cached: false,
          stale: false,
          fetchedAt: '2026-10-22T00:00:00.000Z',
          message: 'No results matched this query.',
        },
      ],
    };
  };

  const { status, body } = await requestBrowse(
    service,
    'sourceId=mangadex&q=%20fixture%20&sortBy=latest&status=Completed&format=Manhwa&demographic=Manhwa&minChapters=12&page=3&refresh=1'
  );

  assert.equal(status, 200);
  assert.equal(received?.sourceId, 'mangadex');
  assert.equal(received?.query, 'fixture');
  assert.equal(received?.sortBy, 'latest');
  assert.equal(received?.status, 'Completed');
  assert.equal(received?.format, 'Manhwa');
  assert.equal(received?.demographic, 'Manhwa');
  assert.equal(received?.minChapters, 12);
  assert.equal(received?.page, 3);
  assert.equal(received?.forceRefresh, true);
  assert.equal(body.sourceOutcomes[0].outcome, 'empty');
  assert.deepEqual(body.results, []);
});

test('browse API identifies catalogue-only connectors without calling the service', async () => {
  const service: BrowseService = async () => {
    throw new Error('Service must not be called for unsupported sources.');
  };

  const { status, body } = await requestBrowse(service, 'sourceId=catalogue-only-source');

  assert.equal(status, 400);
  assert.equal(body.ok, false);
  assert.equal(body.sourceOutcomes[0].outcome, 'unsupported');
  assert.equal(body.sourceOutcomes[0].sourceId, 'catalogue-only-source');
});

test('browse API reports an unexpected service failure without leaking its error', async () => {
  const service: BrowseService = async () => {
    throw new Error('secret upstream response body');
  };

  const { status, body } = await requestBrowse(service, 'sourceId=mangadex');

  assert.equal(status, 502);
  assert.equal(body.ok, false);
  assert.equal(body.sourceOutcomes[0].outcome, 'network_error');
  assert.equal(body.sourceOutcomes[0].message, 'The browse request could not be completed.');
  assert.equal(JSON.stringify(body).includes('secret upstream response body'), false);
});
