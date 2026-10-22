import type { RequestHandler } from 'express';
import {
  DEFAULT_ENABLED_SOURCE_IDS,
  type BrowseDemographicFilter,
  type BrowseFormatFilter,
  type BrowseSortOption,
  type BrowseStatusFilter,
  type LiveSourceBrowseOutcome,
  type SourceId,
} from '../utils/fmdLogic.ts';
import {
  browseLiveFmdSources,
  type LiveBrowseParams,
  type LiveBrowseResult,
} from './fmdLiveScraper.ts';

type BrowseService = (params: LiveBrowseParams) => Promise<LiveBrowseResult>;

export function createBrowseApiHandler(
  browse: BrowseService = browseLiveFmdSources
): RequestHandler {
  return async (req, res) => {
    const sourceId = String(req.query.sourceId || 'ALL') as SourceId | 'ALL';
    const fetchedAt = new Date().toISOString();

    if (sourceId !== 'ALL' && !DEFAULT_ENABLED_SOURCE_IDS.includes(sourceId)) {
      const outcome: LiveSourceBrowseOutcome = {
        sourceId,
        outcome: 'unsupported',
        latencyMs: 0,
        resultCount: 0,
        cached: false,
        stale: false,
        fetchedAt,
        message: 'This connector is catalogued but does not have a live scraper.',
      };
      res.status(400).json({
        ok: false,
        sourceId,
        error: 'This connector is catalogued, but its live scraper is not implemented yet.',
        sourcesQueried: [],
        sourceOutcomes: [outcome],
        fetchedAt,
        results: [],
      });
      return;
    }

    const params: LiveBrowseParams = {
      sourceId,
      query: String(req.query.q || '').trim(),
      sortBy: String(req.query.sortBy || 'popular') as BrowseSortOption,
      status: String(req.query.status || 'All') as BrowseStatusFilter,
      format: String(req.query.format || 'All') as BrowseFormatFilter,
      demographic: String(req.query.demographic || 'All') as BrowseDemographicFilter,
      minChapters: Number(req.query.minChapters) || 0,
      page: Math.max(1, Number(req.query.page) || 1),
      forceRefresh: req.query.refresh === '1' || req.query.refresh === 'true',
    };

    try {
      const data = await browse(params);
      res.json({
        ok: true,
        sourceId,
        page: params.page,
        fetchedAt: new Date().toISOString(),
        sourcesQueried: data.sourcesQueried,
        sourceOutcomes: data.sourceOutcomes,
        results: data.results,
      });
    } catch {
      const checkedSources =
        sourceId === 'ALL' ? DEFAULT_ENABLED_SOURCE_IDS : [sourceId];
      const sourceOutcomes: LiveSourceBrowseOutcome[] = checkedSources.map((id) => ({
        sourceId: id,
        outcome: 'network_error',
        latencyMs: 0,
        resultCount: 0,
        cached: false,
        stale: false,
        fetchedAt: new Date().toISOString(),
        message: 'The browse request could not be completed.',
      }));
      res.status(502).json({
        ok: false,
        sourceId,
        page: params.page,
        fetchedAt: new Date().toISOString(),
        sourcesQueried: checkedSources,
        sourceOutcomes,
        results: [],
      });
    }
  };
}
