# FMD2 Archivist Studio v2.5.0

## Highlights

- Added a discovery home with a spotlight carousel, Continue Reading progress, ranking shelves, hot updates, rising stories, curated lists, authors, and community preview cards.
- Added a global command palette on `Ctrl+K` with keyboard navigation and scoped search.
- Added locally saved browsing presets for format, status, genre, and micro-trope filters.
- Refreshed the catalog, series pages, reader, downloads, and settings with the carbon and violet visual system, responsive navigation, card motion, and fixed-ratio shimmer placeholders.
- Added server-side source browsing and signed image-proxy protections, with coverage for the browse APIs and live scraper.

## Notes

Community profiles and discussions remain preview-only. Ranking shelves use the source data currently available to the app.

## Run from source

Requires Node.js 20.19+ or 22.12+ and npm.

```bash
npm install
npm run dev
```

For checks, run `npm test`, `npm run lint`, and `npm run build`.

## Credits

Built on the open-source [FMD2 ecosystem](https://github.com/dazedcat19/FMD2), with thanks to [riderkick/FMD](https://github.com/riderkick/FMD) and the FMD2 Lua module contributors.
