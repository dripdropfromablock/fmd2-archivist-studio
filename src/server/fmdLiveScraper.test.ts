import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { browseLiveFmdSources } from './fmdLiveScraper.ts';

const mangaDexSeries = {
  id: '00000000-0000-4000-8000-000000000001',
  attributes: {
    title: { en: 'Fixture Series' },
    description: { en: 'Fixture description' },
    status: 'ongoing',
    originalLanguage: 'ja',
    year: 2024,
    lastChapter: '12',
    tags: [],
  },
  relationships: [],
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('MangaDex browse reports a mapped success and a valid empty result separately', async () => {
  const success = await browseLiveFmdSources({
    sourceId: 'mangadex',
    query: `success-${randomUUID()}`,
    fetcher: async () => jsonResponse({ data: [mangaDexSeries] }),
    forceRefresh: true,
  });

  assert.equal(success.sourceOutcomes[0]?.outcome, 'success');
  assert.equal(success.sourceOutcomes[0]?.resultCount, 1);
  assert.equal(success.results[0]?.title, 'Fixture Series');

  const empty = await browseLiveFmdSources({
    sourceId: 'mangadex',
    query: `empty-${randomUUID()}`,
    fetcher: async () => jsonResponse({ data: [] }),
    forceRefresh: true,
  });

  assert.deepEqual(empty.results, []);
  assert.equal(empty.sourceOutcomes[0]?.outcome, 'empty');
  assert.equal(empty.sourceOutcomes[0]?.resultCount, 0);
});

test('each live adapter parses a representative fixture without contacting a source site', async () => {
  const weebId = randomUUID().replace(/-/g, '').slice(0, 24).toUpperCase();
  const weebHtml = `<article class="bg-base-300 flex gap-4 p-4">
    <a href="https://weebcentral.com/series/${weebId}/fixture-series"></a>
    <a class="line-clamp-1 link link-hover">Fixture Weeb Series</a>
    <strong>Year:</strong><span>2024</span>
    <strong>Status:</strong><span>Ongoing</span>
    <strong>Type:</strong><span>Manga</span>
  </article>`;
  const weebChapters = '<a href="/chapters/CHAPTER123"><span class="">Chapter 1</span></a>';
  const asuraPayload = JSON.stringify({
    initialSeries: [
      {
        id: 123,
        slug: 'fixture-asura',
        title: 'Fixture Asura Series',
        public_url: '/comics/fixture-asura',
        chapter_count: 8,
        latest_chapters: [],
      },
    ],
    public_url: 'https://asurascans.com/browse/comics',
  }).replace(/"/g, '&quot;');
  const likeMangaHtml = `<div class="col-lg-3 col-md-4 col-sm-4 col-6">
    <a href="/fixture-like-123/"></a>
    <img src="https://images.invalid/fixture.jpg" alt="Fixture Like Manga">
    <a class="jtip text-body">Fixture Like Manga</a>
  </div>`;
  const mangaKatanaHtml = `<div class="item" data-genre="Action">
    <h3 class="title"><a href="https://mangakatana.com/manga/fixture-katana.123">Fixture Katana</a><span> - Chapter 8</span></h3>
  </div>`;

  const fixtures: Array<{
    sourceId: 'weebcentral' | 'asurascans' | 'mangadex' | 'likemanga' | 'mangakatana';
    fetcher: typeof fetch;
    expectedTitle: string;
  }> = [
    {
      sourceId: 'weebcentral',
      fetcher: async (input) =>
        new Response(String(input).includes('full-chapter-list') ? weebChapters : weebHtml),
      expectedTitle: 'Fixture Weeb Series',
    },
    {
      sourceId: 'asurascans',
      fetcher: async () => new Response(`<astro-island props="${asuraPayload}"></astro-island>`),
      expectedTitle: 'Fixture Asura Series',
    },
    {
      sourceId: 'mangadex',
      fetcher: async () => jsonResponse({ data: [mangaDexSeries] }),
      expectedTitle: 'Fixture Series',
    },
    {
      sourceId: 'likemanga',
      fetcher: async () => new Response(likeMangaHtml),
      expectedTitle: 'Fixture Like Manga',
    },
    {
      sourceId: 'mangakatana',
      fetcher: async () => new Response(mangaKatanaHtml),
      expectedTitle: 'Fixture Katana',
    },
  ];

  for (const fixture of fixtures) {
    const result = await browseLiveFmdSources({
      sourceId: fixture.sourceId,
      query: `fixture-${fixture.sourceId}-${randomUUID()}`,
      fetcher: fixture.fetcher,
      forceRefresh: true,
    });
    assert.equal(result.sourceOutcomes[0]?.outcome, 'success', fixture.sourceId);
    assert.equal(result.results[0]?.title, fixture.expectedTitle, fixture.sourceId);
    assert.ok(result.results[0]?.chapters.length, `${fixture.sourceId} should map its chapter data`);
  }
});

test('browse classifies upstream HTTP and malformed JSON failures', async () => {
  const httpFailure = await browseLiveFmdSources({
    sourceId: 'mangadex',
    query: `http-${randomUUID()}`,
    fetcher: async () => new Response('unavailable', { status: 503 }),
    forceRefresh: true,
  });
  assert.equal(httpFailure.sourceOutcomes[0]?.outcome, 'http_error');
  assert.match(httpFailure.sourceOutcomes[0]?.message || '', /HTTP 503/);

  const parseFailure = await browseLiveFmdSources({
    sourceId: 'mangadex',
    query: `parse-${randomUUID()}`,
    fetcher: async () => new Response('{ malformed json'),
    forceRefresh: true,
  });
  assert.equal(parseFailure.sourceOutcomes[0]?.outcome, 'parse_error');
  assert.equal(parseFailure.results.length, 0);
});

test('all live adapters report HTTP and timeout failures explicitly', async () => {
  const sourceIds = ['weebcentral', 'asurascans', 'mangadex', 'likemanga', 'mangakatana'] as const;
  for (const sourceId of sourceIds) {
    const httpFailure = await browseLiveFmdSources({
      sourceId,
      query: `http-${sourceId}-${randomUUID()}`,
      fetcher: async () => new Response('unavailable', { status: 502 }),
      forceRefresh: true,
    });
    assert.equal(httpFailure.sourceOutcomes[0]?.outcome, 'http_error', sourceId);

    const timeoutFailure = await browseLiveFmdSources({
      sourceId,
      query: `timeout-${sourceId}-${randomUUID()}`,
      fetcher: async () => {
        const error = new Error('fixture timeout');
        error.name = 'TimeoutError';
        throw error;
      },
      forceRefresh: true,
    });
    assert.equal(timeoutFailure.sourceOutcomes[0]?.outcome, 'timeout', sourceId);
  }
});

test('all live adapters recognize their empty-result fixtures', async () => {
  const htmlEmptyFetcher: typeof fetch = async () =>
    new Response('<html><body>No results found</body></html>');
  const sourceIds = ['weebcentral', 'asurascans', 'likemanga', 'mangakatana'] as const;

  for (const sourceId of sourceIds) {
    const result = await browseLiveFmdSources({
      sourceId,
      query: `empty-${sourceId}-${randomUUID()}`,
      fetcher: htmlEmptyFetcher,
      forceRefresh: true,
    });
    assert.equal(result.sourceOutcomes[0]?.outcome, 'empty', sourceId);
    assert.deepEqual(result.results, [], sourceId);
  }

  const mangaDexEmpty = await browseLiveFmdSources({
    sourceId: 'mangadex',
    query: `empty-mangadex-${randomUUID()}`,
    fetcher: async () => jsonResponse({ data: [] }),
    forceRefresh: true,
  });
  assert.equal(mangaDexEmpty.sourceOutcomes[0]?.outcome, 'empty', 'mangadex');
});

test('browse reports malformed HTML as a parse error and returns stale results on refresh failure', async () => {
  const malformedHtml = await browseLiveFmdSources({
    sourceId: 'likemanga',
    query: `markup-${randomUUID()}`,
    fetcher: async () => new Response('<html><body>Unexpected challenge page</body></html>'),
    forceRefresh: true,
  });
  assert.equal(malformedHtml.sourceOutcomes[0]?.outcome, 'parse_error');

  const query = `stale-${randomUUID()}`;
  const fresh = await browseLiveFmdSources({
    sourceId: 'mangadex',
    query,
    fetcher: async () => jsonResponse({ data: [mangaDexSeries] }),
    forceRefresh: true,
  });
  assert.equal(fresh.sourceOutcomes[0]?.outcome, 'success');

  const stale = await browseLiveFmdSources({
    sourceId: 'mangadex',
    query,
    fetcher: async () => new Response('unavailable', { status: 503 }),
    forceRefresh: true,
  });
  assert.equal(stale.sourceOutcomes[0]?.outcome, 'http_error');
  assert.equal(stale.sourceOutcomes[0]?.cached, true);
  assert.equal(stale.sourceOutcomes[0]?.stale, true);
  assert.equal(stale.results[0]?.title, 'Fixture Series');
});

test('all-source browse preserves successful results and reports each source outcome', async () => {
  const query = `partial-${randomUUID()}`;
  const fetcher: typeof fetch = async (input) => {
    const url = String(input);
    if (url.includes('api.mangadex.org/manga')) {
      return jsonResponse({ data: [mangaDexSeries] });
    }
    if (url.includes('weebcentral.com')) {
      return new Response('upstream unavailable', { status: 503 });
    }
    return new Response('<html><body>No results found</body></html>');
  };

  const result = await browseLiveFmdSources({
    sourceId: 'ALL',
    query,
    fetcher,
    forceRefresh: true,
  });

  assert.equal(result.results.length, 1);
  assert.equal(result.results[0]?.title, 'Fixture Series');
  assert.equal(result.sourceOutcomes.length, 5);
  assert.equal(
    result.sourceOutcomes.find((outcome) => outcome.sourceId === 'weebcentral')?.outcome,
    'http_error'
  );
  assert.equal(
    result.sourceOutcomes.find((outcome) => outcome.sourceId === 'mangadex')?.outcome,
    'success'
  );
});
