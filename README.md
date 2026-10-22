# FMD2 Archivist Studio

> **A standalone manga and webtoon reader, live source browser, and CBZ / ZIP chapter archiver built around five live FMD2 source adapters and the broader FMD2 connector catalogue.**

**Current stable release: v2.5.0**

---

## Overview

**FMD2 Archivist Studio** is an independent, standalone web application designed for browsing, reading, and archiving manga, manhwa, and manhua across live multi-source catalogs. Rather than operating as a fork of the desktop Lazarus/FreePascal client, this project provides a modern full-stack TypeScript/React studio interface and Node.js scraper & packaging engine inspired by and built on top of FMD2's Lua module architecture.

### Key Capabilities

- **Browse Sources Primary Workspace**: Live catalog browsing across `WeebCentral`, `AsuraScans`, `MangaDex`, `LikeManga`, and `MangaKatana`, with additional FMD2 Lua connector descriptors clearly separated from live adapters.
- **Discovery Home**: Spotlight picks, Continue Reading progress, ranking shelves, hot updates, rising stories, curated lists, authors, and community preview cards.
- **Global Command Palette**: Press `Ctrl+K` to search series and the available user and author scopes with keyboard navigation.
- **Saved Filter Presets**: Save and restore format, status, genre, and micro-trope filters in local storage.
- **Interactive Header & Filter Deck Dropdowns**: Filter and sort live catalogs by **Genre**, **Status** (`Ongoing`, `Completed`, `Hiatus`), **Sort by** (`Popularity`, `Newest`, `Alphabetical`, `Rating`, `Most Chapters`), **Format**, **Demographic**, and **Minimum Chapters** using accessible custom popover dropdown menus with live search and item counts.
- **Adaptive Manga & Webtoon Reader**: Automatically detects **Webtoon Long-Strip** vs. **Single-Page / Double-Page RTL Manga** layouts based on series metadata, complete with optical image filters (contrast, warmth, sharpen, grayscale), auto-scroll, and keyboard navigation.
- **Batch CBZ / ZIP Archivist Engine**: Concurrent page downloads with range selection (`1-25`, `10+`), automatic missing-chapter detection, and real PKZIP packaging. CBZ exports include `ComicInfo.xml` metadata.
- **Cross-Device Cloud Sync & Read Later Queue**: Deterministic reading history synchronization, chapter progression heatmaps, and a dedicated Read Later queue.

---

## Quick Start

### Prerequisites
- **Node.js** 20.19+ or 22.12+ and **npm** (required by the project's Vite 8 version)

### Installation & Local Development

```bash
# 1. Install dependencies
npm install

# 2. Copy the example environment configuration (optional)
cp .env.example .env

# 3. Start the full-stack development server on http://localhost:3000
npm run dev
```

### Running Unit Tests & Production Build

```bash
# Run the test suite
npm test

# Build for production
npm run build
```

### Server Data and Deployment

The server stores download archives, queue state, and reading-sync profiles in `.fmd2-data/` by default. Set `FMD_DATA_DIR` to a durable directory in deployments where local files do not survive restarts. The current file-backed queue and sync store are designed for a single server instance; horizontal scaling needs a coordinated database and queue. For production, the server listens on all interfaces by default so a platform ingress can reach it; keep it behind a trusted ingress. Image-proxy signatures use a per-process key unless `IMAGE_PROXY_SIGNING_KEY` is configured, so multi-instance deployments must provide the same key to every instance.

---

## Architecture

```text
├── README.md                          # Project documentation & FMD2 credits
├── server.ts                          # Express + Vite full-stack server & API routes
└── src/
    ├── App.tsx                        # Primary Studio workspace & navigation shell
    ├── components/
    │   ├── BrowseSourcesView.tsx      # Multi-source live catalog browser & filter deck
    │   ├── DropdownMenu.tsx           # Custom animated popover dropdown component
    │   ├── MangaReaderView.tsx        # Full-screen RTL/LTR & Webtoon reader
    │   ├── MangaSeriesPage.tsx        # Series details, chapter progression & batch tools
    │   ├── DownloadManagerView.tsx    # Multi-threaded download queue & CBZ packager
    │   ├── ReadLaterQueueView.tsx     # Prioritized Read Later chapter queue
    │   └── SourcesSettingsView.tsx    # FMD2 Lua connector verifier & theme preferences
    ├── data/
    │   └── fmd2SourcesRegistry.ts     # Registry of verified FMD2 Lua connector metadata
    ├── server/
    │   ├── fmdEngine.ts               # Server-side download queue & Cloud Sync engine
    │   └── fmdLiveScraper.ts          # Live upstream source scrapers & metadata resolvers
    └── utils/
        └── fmdLogic.ts                # Pure catalog filtering, sorting & PKZIP CBZ builder
```

---

## Credits & Acknowledgments

**FMD2 Archivist Studio** is a standalone project built on top of the open-source **Free Manga Downloader 2 (FMD2)** ecosystem. Special thanks and full credit go to:

- **[dazedcat19/FMD2 (Free Manga Downloader 2)](https://github.com/dazedcat19/FMD2)** — For maintaining and expanding the community-driven FMD2 project, Lua website connector modules, and downloader architecture that power the source registry and connector specifications in this studio.
- **[riderkick/FMD (Original Free Manga Downloader)](https://github.com/riderkick/FMD)** — For creating the original Free Manga Downloader architecture and pioneering open-source manga archiving tools.
- **FMD2 Open-Source Contributors & Lua Module Maintainers** — For writing and maintaining the 600+ site connectors across the FMD2 ecosystem.

---

## License

Released as an open-source standalone project built on top of the FMD2 ecosystem. See upstream [FMD2 repository](https://github.com/dazedcat19/FMD2) for original Lua connector module licenses.
