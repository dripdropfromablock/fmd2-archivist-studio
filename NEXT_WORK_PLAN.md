# Recommended Next Work

## Recommendation

Make the live source experience trustworthy before expanding its source count. The app currently has five live adapters alongside a much larger catalogue of FMD2 connector metadata. When an upstream request fails or its page structure changes, several scraper functions return an empty list; the all-source browse path also substitutes empty lists on timeout. The API and browse UI can therefore present an outage or parser break as an ordinary no-results state.

The next milestone should make source outcomes visible, cover the five existing adapters with deterministic tests, and then add one complete connector as an end-to-end vertical slice.

## Evidence from the current codebase

- `README.md` describes five live source adapters and a much broader FMD2 connector catalogue.
- `src/server/fmdLiveScraper.ts` implements the five live adapters. Many request, HTTP, and parsing failure paths return `[]`; the all-source query path uses empty-list fallbacks for timed-out adapters.
- `server.ts` returns `ok: false` for an unexpected browse exception, but the browse client does not render an error state from that field.
- `src/components/BrowseSourcesView.tsx` updates its sync label only when results arrive. An empty result or failed fetch can leave users without a clear distinction between “no matches” and “source unavailable.”
- `package.json` runs only `src/utils/fmdLogic.test.ts`. There are no current scraper or API route tests in the repository.

## Phase 1 — Make source status observable

**Priority: P0. Do this first.**

### Work

1. Define a typed per-source browse outcome, separate from the returned manga list. Include the source ID, outcome (`success`, `empty`, `timeout`, `http_error`, `parse_error`, or `unsupported`), elapsed time, result count, and whether cached data was used.
2. Return one outcome for each requested adapter. Keep successful sources and their results when another source fails, so a partial failure does not erase useful results.
3. Distinguish a valid empty result from a failed request. Preserve useful cached results on upstream failure where available, and identify them as stale in the response.
4. Update Browse Sources to show a concise partial-outage or source-failure message, a true empty-search message, and a retry action. Keep the existing unsupported-source explanation for catalogued connectors without live scrapers.
5. Make status labels accurate: report which sources returned data, which were empty, and which failed instead of treating the requested source list as proof of success.

### Acceptance criteria

- Users can tell the difference between no matches, an upstream outage, a parser failure, and a catalogue-only source.
- A failed adapter does not hide results from adapters that succeeded.
- If cached data is shown after a failure, the UI identifies it as cached/stale and gives the last successful refresh time.
- API responses contain safe diagnostics only; they do not expose upstream response bodies or secrets.

## Phase 2 — Add deterministic adapter and route coverage

**Priority: P0. Build alongside Phase 1.**

### Work

1. Extract or inject the HTTP fetch boundary so tests can supply controlled responses without contacting live websites.
2. Add representative HTML/JSON fixtures for each current adapter and verify parsed IDs, titles, chapter counts, page URLs, and source attribution.
3. Cover failure cases for each adapter: timeout, non-success HTTP response, malformed or changed markup, and a legitimate empty catalog.
4. Add API-level tests for `ALL`, a single supported source, and a catalogue-only unsupported source; assert both results and per-source outcomes.
5. Add regression cases for partial success and stale-cache fallback.

### Acceptance criteria

- Tests run offline and deterministically through the project’s existing `npm test` command.
- A fixture that no longer matches an adapter’s parser fails with a useful assertion instead of silently passing as an empty catalog.
- No test depends on a third-party site being online or keeping its current markup.

## Phase 3 — Ship one complete additional live source

**Priority: P1. Start after the outcome contract is agreed by the implementation.**

### Work

1. Rank candidate catalogue sources using user demand, current availability, stability of browse/chapter/page flows, and the quality of the corresponding FMD2 module as a reference.
2. Choose one candidate and implement the full user path: browse/search, series chapters, chapter pages, image proxying, reader navigation, and download support where the source permits it.
3. Add fixture-based tests for its successful path and expected failure modes before marking it live.
4. Add it to the enabled live-source list only when the full path works. Keep all other catalogue entries explicitly marked as catalogue-only.
5. Update the README and source settings UI to reflect the new verified capability.

### Acceptance criteria

- A user can browse a series, open its chapters, read a chapter, and use supported archive actions from the new source.
- The source has deterministic test coverage and reports health/outcomes through the same contract as existing adapters.
- No source is labelled live based only on a successful homepage HTTP check.

## Later priorities

1. **Production persistence and deployment:** the README documents a file-backed queue and sync store intended for a single server instance. If the app will support multiple users or horizontally scaled deployments, define authentication/ownership and move shared state to a durable coordinated store.
2. **Operational visibility:** record adapter success rate, latency, timeout rate, and parser failures over time, with retention limits and no user reading data in those metrics.
3. **More adapters:** repeat the complete-source vertical slice based on demand and measured maintenance cost rather than enabling a large number of unverified catalogue entries at once.

## Suggested delivery order

1. Agree on the per-source outcome shape.
2. Add the fetch seam and adapter fixtures.
3. Implement outcome reporting, partial-result handling, cache fallback, and the Browse Sources feedback states.
4. Add route-level tests and verify the existing app flows.
5. Select and implement one additional source end to end.

## Definition of done for the next milestone

- Browse never silently equates a source outage with a valid empty search.
- Existing live adapters have offline, fixture-based coverage for normal and failure behavior.
- Partial results remain usable and their source status is visible.
- One additional source is enabled only after browse, reader, and supported download flows are verified.
- Documentation matches the actual live-source capabilities.
