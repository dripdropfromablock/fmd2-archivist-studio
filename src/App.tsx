import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Search,
  BookOpen,
  Download,
  Bookmark,
  Link2,
  SlidersHorizontal,
  X,
  CheckCircle2,
  RefreshCw,
  Play,
  History,
  Trash2,
  Clock,
  Palette,
  Check,
  Sparkles,
  Keyboard,
  Type,
  Cloud,
  UploadCloud,
  DownloadCloud,
  Laptop,
  Home,
  TrendingUp,
  UserRound,
  Layers,
  UsersRound,
  ChevronLeft,
  ChevronRight,
  Settings2,
} from 'lucide-react';
import {
  ALL_FMD2_SOURCES,
  DEFAULT_ENABLED_SOURCE_IDS,
  DEFAULT_WEBTOON_TRIGGER_TAGS,
  APP_THEME_PRESETS,
  ACCENT_COLOR_PRESETS,
  UI_ANIMATION_PRESETS,
  SURFACE_STYLE_PRESETS,
  APPLE_FONT_PRESETS,
  DEFAULT_UI_THEME_PREFS,
  updateUiThemePreferences,
  toggleAmbientGlowPreference,
  PRIMARY_NAV_SHORTCUTS,
  resolvePrimaryNavShortcutTab,
  resolveSeriesReadingMode,
  filterAndRankMangaCatalog,
  getEffectiveSeriesSources,
  summarizeDownloadQueue,
  enqueueChaptersForDownload,
  resolveMissingChaptersForBatch,
  toggleCatalogSeriesSelection,
  areAllCatalogSeriesSelected,
  toggleSelectAllCatalogSeries,
  computeCatalogBulkSelectionStats,
  enqueueMultipleSeriesForDownload,
  upsertReadingProgress,
  getSeriesReadingProgress,
  resolveResumeChapter,
  getSortedRecentlyReadEntries,
  formatRelativeReadTime,
  computeReadingSyncDurationMs,
  formatReadingSyncTime,
  DEFAULT_CLOUD_SYNC_KEY,
  normalizeCloudSyncKey,
  mergeReadingHistories,
  mergeBookmarkedIds,
  hasUnsyncedReadingChanges,
  READ_LATER_STORAGE_KEY,
  addChapterToReadLaterQueue,
  removeChapterFromReadLaterQueue,
  toggleChapterInReadLaterQueue,
  moveReadLaterQueueItem,
  type MangaSeries,
  type MangaChapter,
  type SourceId,
  type ArchiveFormat,
  type DownloadTask,
  type FmdEngineConfig,
  type ReadingMode,
  type ReadingSessionProgress,
  type UiThemePreferences,
  type CloudSyncStatus,
  type CloudSyncConfig,
  type CloudSyncSnapshot,
  type ReadLaterItem,
} from './utils/fmdLogic.ts';
import {
  INITIAL_MANGA_CATALOG,
  INITIAL_DOWNLOAD_QUEUE,
} from './data/mangaCatalog.ts';
import {
  enqueueAndDownloadChapters,
  triggerBrowserFileDownload,
} from './utils/browserDownload.ts';
import { MangaCoverArt } from './components/MangaArtRenderer.tsx';
import { InteractiveCursorOverlay } from './components/InteractiveCursorOverlay.tsx';
import { DiscoverHomeView } from './components/DiscoverHomeView.tsx';
import { CommandPalette } from './components/CommandPalette.tsx';

const BrowseSourcesView = React.lazy(() =>
  import('./components/BrowseSourcesView.tsx').then((module) => ({
    default: module.BrowseSourcesView,
  }))
);
const ReadLaterQueueView = React.lazy(() =>
  import('./components/ReadLaterQueueView.tsx').then((module) => ({
    default: module.ReadLaterQueueView,
  }))
);
const MangaSeriesPage = React.lazy(() =>
  import('./components/MangaSeriesPage.tsx').then((module) => ({
    default: module.MangaSeriesPage,
  }))
);
const DownloadManagerView = React.lazy(() =>
  import('./components/DownloadManagerView.tsx').then((module) => ({
    default: module.DownloadManagerView,
  }))
);
const MangaReaderView = React.lazy(() =>
  import('./components/MangaReaderView.tsx').then((module) => ({
    default: module.MangaReaderView,
  }))
);
const SmartDiscoveryView = React.lazy(() =>
  import('./components/SmartDiscoveryView.tsx').then((module) => ({
    default: module.SmartDiscoveryView,
  }))
);
const SourcesSettingsView = React.lazy(() =>
  import('./components/SourcesSettingsView.tsx').then((module) => ({
    default: module.SourcesSettingsView,
  }))
);
const MangaDetailModal = React.lazy(() =>
  import('./components/MangaDetailModal.tsx').then((module) => ({
    default: module.MangaDetailModal,
  }))
);
const GitHubReleaseModal = React.lazy(() =>
  import('./components/GitHubReleaseModal.tsx').then((module) => ({
    default: module.GitHubReleaseModal,
  }))
);

type ActiveTab =
  | 'home'
  | 'catalog'
  | 'browse'
  | 'read-later'
  | 'series'
  | 'downloads'
  | 'reader'
  | 'archivist'
  | 'settings';
type CatalogLibraryFilter = 'all' | 'saved' | 'recent';

const READING_PROGRESS_STORAGE_KEY = 'fmd2_reading_progress_v1';
const UI_THEME_STORAGE_KEY = 'fmd2_ui_theme_prefs_v1';
const CLOUD_SYNC_CONFIG_STORAGE_KEY = 'fmd2_cloud_sync_config_v1';
const IS_PACKAGED_RELEASE = false;

const INITIAL_READING_HISTORY: Record<string, ReadingSessionProgress> = {};

function createDefaultCloudSyncConfig(): CloudSyncConfig {
  const defaultDeviceId = `device-${Math.random().toString(36).slice(2, 8)}`;
  return {
    syncKey: DEFAULT_CLOUD_SYNC_KEY,
    deviceId: defaultDeviceId,
    deviceName: 'FMD2 Web Studio',
    autoSync: true,
    lastSyncedAt: null,
    revision: 1,
  };
}

function WorkspaceLoadingFallback() {
  return (
    <div
      className="min-h-[40vh] flex items-center justify-center gap-3 text-sm text-slate-400"
      role="status"
      aria-live="polite"
    >
      <span
        className="h-4 w-4 rounded-full border-2 border-slate-700 border-t-indigo-400 animate-spin"
        aria-hidden="true"
      />
      <span>Loading workspace…</span>
    </div>
  );
}

function ModalLoadingFallback() {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-3 rounded-xl border border-slate-700 bg-[#0F1523] px-5 py-4 text-sm text-slate-300 shadow-2xl">
        <span
          className="h-4 w-4 rounded-full border-2 border-slate-700 border-t-indigo-400 animate-spin"
          aria-hidden="true"
        />
        <span>Opening dialog…</span>
      </div>
    </div>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('home');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [activeHomeSection, setActiveHomeSection] = useState('browse');
  const [catalog, setCatalog] = useState<MangaSeries[]>(INITIAL_MANGA_CATALOG);
  const [isInitialCatalogLoading, setIsInitialCatalogLoading] = useState<boolean>(true);
  const [liveSearchResults, setLiveSearchResults] = useState<MangaSeries[]>([]);
  const [isSearchingLive, setIsSearchingLive] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSourceFilter, setActiveSourceFilter] = useState<SourceId | 'all'>('all');
  const [selectedGenre, setSelectedGenre] = useState<string>('All');
  const [libraryFilter, setLibraryFilter] = useState<CatalogLibraryFilter>('all');
  const [bookmarkedIds, setBookmarkedIds] = useState<string[]>([]);
  const [readLaterQueue, setReadLaterQueue] = useState<ReadLaterItem[]>(() => {
    try {
      const raw = window.localStorage.getItem(READ_LATER_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as ReadLaterItem[];
        if (Array.isArray(parsed)) {
          return parsed;
        }
      }
    } catch {
      // Ignore storage error
    }
    return [];
  });
  const [selectedCatalogSeriesIds, setSelectedCatalogSeriesIds] = useState<string[]>([]);
  const [isBulkQueueingCatalog, setIsBulkQueueingCatalog] = useState<boolean>(false);
  const [readingHistory, setReadingHistory] = useState<Record<string, ReadingSessionProgress>>(
    () => {
      try {
        const raw = window.localStorage.getItem(READING_PROGRESS_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as Record<string, ReadingSessionProgress>;
          if (parsed && typeof parsed === 'object') {
            return parsed;
          }
        }
      } catch {
        // Fallback to initial reading history
      }
      return INITIAL_READING_HISTORY;
    }
  );
  const [downloadQueue, setDownloadQueue] = useState<DownloadTask[]>(INITIAL_DOWNLOAD_QUEUE);
  const [engineConfig, setEngineConfig] = useState<FmdEngineConfig>({
    maxConcurrentTasks: 3,
    maxThreadsPerTask: 4,
    includeComicInfoXml: true,
    defaultFormat: 'CBZ',
    saveDirectory: '/tmp/fmd2-downloads',
    autoDownloadToBrowser: true,
    enabledSources: [...DEFAULT_ENABLED_SOURCE_IDS],
    autoDetectReadingMode: true,
    defaultReadingMode: 'single',
    webtoonTriggerTags: [...DEFAULT_WEBTOON_TRIGGER_TAGS],
  });
  const [globalDownloadNotice, setGlobalDownloadNotice] = useState<string | null>(null);

  // Active series for Main Manga Page and optional quick inspector modal
  const [activeSeriesPage, setActiveSeriesPage] = useState<MangaSeries | null>(null);
  const [seriesReturnTab, setSeriesReturnTab] = useState<
    'home' | 'catalog' | 'browse' | 'read-later' | 'archivist'
  >('browse');
  const [inspectedSeries, setInspectedSeries] = useState<MangaSeries | null>(null);

  // Active reader state (populated from live catalog or user selection)
  const [readerSeries, setReaderSeries] = useState<MangaSeries | null>(
    INITIAL_MANGA_CATALOG[0] || null
  );
  const [readerChapter, setReaderChapter] = useState<MangaChapter | null>(
    INITIAL_MANGA_CATALOG[0]
      ? INITIAL_MANGA_CATALOG[0].chapters[INITIAL_MANGA_CATALOG[0].chapters.length - 1] ||
          INITIAL_MANGA_CATALOG[0].chapters[0] ||
          null
      : null
  );
  const [readerInitialMode, setReaderInitialMode] = useState<ReadingMode | null>(null);
  const [readerInitialPage, setReaderInitialPage] = useState<number | null>(null);

  // Studio Theme & Appearance Preferences
  const [themePrefs, setThemePrefs] = useState<UiThemePreferences>(() => {
    try {
      const raw = window.localStorage.getItem(UI_THEME_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<UiThemePreferences>;
        if (parsed && typeof parsed === 'object') {
          return { ...DEFAULT_UI_THEME_PREFS, ...parsed };
        }
      }
    } catch {
      // Ignore storage error
    }
    return DEFAULT_UI_THEME_PREFS;
  });
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);
  const [showCloudSyncModal, setShowCloudSyncModal] = useState(false);
  const [cloudSyncConfig, setCloudSyncConfig] = useState<CloudSyncConfig>(() => {
    const fallback = createDefaultCloudSyncConfig();
    try {
      const raw = window.localStorage.getItem(CLOUD_SYNC_CONFIG_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<CloudSyncConfig>;
        if (parsed && typeof parsed === 'object') {
          return {
            ...fallback,
            ...parsed,
            syncKey: normalizeCloudSyncKey(parsed.syncKey || fallback.syncKey),
          };
        }
      }
    } catch {
      // Ignore storage error
    }
    return fallback;
  });
  const [cloudSyncStatus, setCloudSyncStatus] = useState<CloudSyncStatus>('synced');
  const [cloudSyncNotice, setCloudSyncNotice] = useState<string | null>(null);
  const [syncKeyInput, setSyncKeyInput] = useState<string>(cloudSyncConfig.syncKey);
  const [deviceNameInput, setDeviceNameInput] = useState<string>(cloudSyncConfig.deviceName);
  const readingHistoryRef = React.useRef(readingHistory);
  readingHistoryRef.current = readingHistory;
  const bookmarkedIdsRef = React.useRef(bookmarkedIds);
  bookmarkedIdsRef.current = bookmarkedIds;
  const searchInputRef = React.useRef<HTMLInputElement | null>(null);

  const activeThemePreset = useMemo(
    () =>
      APP_THEME_PRESETS.find((t) => t.id === themePrefs.themeId) || APP_THEME_PRESETS[0],
    [themePrefs.themeId]
  );

  const handleUpdateThemePrefs = useCallback((partial: Partial<UiThemePreferences>) => {
    setThemePrefs((prev) => {
      const next = updateUiThemePreferences(prev, partial);
      try {
        window.localStorage.setItem(UI_THEME_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Ignore storage errors
      }
      return next;
    });
  }, []);

  // Synchronize theme & Apple font attributes to <html> for global styling
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', themePrefs.themeId);
    root.setAttribute('data-theme-mode', activeThemePreset.mode);
    root.setAttribute('data-font', themePrefs.fontFamily || 'sf-pro');
    if (themePrefs.accentId !== 'theme-default') {
      root.setAttribute('data-accent', themePrefs.accentId);
    } else {
      root.removeAttribute('data-accent');
    }
    root.setAttribute('data-motion', themePrefs.animationStyle);
    root.setAttribute('data-surface', themePrefs.surfaceStyle);
    root.setAttribute('data-hover', themePrefs.cardHoverEffects ? 'enabled' : 'disabled');
    root.setAttribute('data-ambient-glow', themePrefs.ambientGlow ? 'enabled' : 'disabled');
  }, [themePrefs, activeThemePreset.mode]);

  // Global Tactile Spring Button Press Animation on any button interaction
  useEffect(() => {
    if (themePrefs.animationStyle === 'minimal') return;
    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      const btn = target?.closest('button');
      if (!btn || btn.disabled) return;
      btn.classList.remove('btn-pressed-anim');
      // Force reflow to restart spring keyframe cleanly
      void btn.offsetWidth;
      btn.classList.add('btn-pressed-anim');
    };
    window.addEventListener('pointerdown', handlePointerDown, { passive: true });
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, [themePrefs.animationStyle]);

  // Persist readingHistory to localStorage whenever it changes
  useEffect(() => {
    try {
      window.localStorage.setItem(
        READING_PROGRESS_STORAGE_KEY,
        JSON.stringify(readingHistory)
      );
    } catch {
      // Ignore storage quota errors
    }
  }, [readingHistory]);

  // Persist readLaterQueue to localStorage whenever it changes
  useEffect(() => {
    try {
      window.localStorage.setItem(
        READ_LATER_STORAGE_KEY,
        JSON.stringify(readLaterQueue)
      );
    } catch {
      // Ignore storage quota errors
    }
  }, [readLaterQueue]);

  // Persist cloudSyncConfig to localStorage whenever it changes
  useEffect(() => {
    try {
      window.localStorage.setItem(
        CLOUD_SYNC_CONFIG_STORAGE_KEY,
        JSON.stringify(cloudSyncConfig)
      );
    } catch {
      // Ignore storage errors
    }
  }, [cloudSyncConfig]);

  const pushReadingHistoryToCloud = useCallback(
    async (
      historyPayload: Record<string, ReadingSessionProgress>,
      bookmarksPayload: string[],
      options?: {
        syncKey?: string;
        deviceName?: string;
        mode?: 'merge' | 'overwrite';
        entry?: Partial<ReadingSessionProgress>;
        announce?: boolean;
      }
    ): Promise<CloudSyncSnapshot | null> => {
      const targetKey = normalizeCloudSyncKey(options?.syncKey || cloudSyncConfig.syncKey);
      const targetDeviceName = (options?.deviceName || cloudSyncConfig.deviceName).trim() || 'FMD2 Web Studio';
      setCloudSyncStatus('syncing');

      try {
        const res = await fetch('/api/sync/reading-history', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            syncKey: targetKey,
            readingHistory: historyPayload,
            entry: options?.entry,
            bookmarkedIds: bookmarksPayload,
            deviceId: cloudSyncConfig.deviceId,
            deviceName: targetDeviceName,
            mode: options?.mode || 'merge',
          }),
        });
        if (!res.ok) {
          setCloudSyncStatus('error');
          return null;
        }
        const data = (await res.json()) as CloudSyncSnapshot & { ok?: boolean };
        if (data && data.readingHistory) {
          setReadingHistory((prev) =>
            options?.mode === 'overwrite'
              ? data.readingHistory
              : mergeReadingHistories(prev, data.readingHistory)
          );
          if (Array.isArray(data.bookmarkedIds)) {
            setBookmarkedIds((prev) =>
              options?.mode === 'overwrite'
                ? data.bookmarkedIds
                : mergeBookmarkedIds(prev, data.bookmarkedIds)
            );
          }
          const syncedTime = data.updatedAt || new Date().toISOString();
          setCloudSyncConfig((prev) => ({
            ...prev,
            syncKey: targetKey,
            deviceName: targetDeviceName,
            lastSyncedAt: syncedTime,
            revision: data.revision || prev.revision + 1,
          }));
          setCloudSyncStatus('synced');
          if (options?.announce) {
            const count = Object.keys(data.readingHistory).length;
            setCloudSyncNotice(
              `Synced ${count} reading session${count === 1 ? '' : 's'} with Cloud Profile "${targetKey}" (Rev #${data.revision || 1}).`
            );
          }
          return data;
        }
        setCloudSyncStatus('synced');
        return null;
      } catch {
        setCloudSyncStatus('offline');
        return null;
      }
    },
    [cloudSyncConfig.syncKey, cloudSyncConfig.deviceId, cloudSyncConfig.deviceName]
  );

  const pullAndMergeCloudReadingHistory = useCallback(
    async (options?: {
      syncKey?: string;
      announce?: boolean;
      overwriteLocal?: boolean;
    }): Promise<CloudSyncSnapshot | null> => {
      const targetKey = normalizeCloudSyncKey(options?.syncKey || cloudSyncConfig.syncKey);
      setCloudSyncStatus('syncing');

      try {
        const res = await fetch(
          `/api/sync/reading-history?syncKey=${encodeURIComponent(targetKey)}`
        );
        if (!res.ok) {
          setCloudSyncStatus('error');
          return null;
        }
        const remote = (await res.json()) as CloudSyncSnapshot & { ok?: boolean };
        const remoteHistory = remote.readingHistory || {};
        const currentLocal = readingHistoryRef.current;
        const mergedHistory = options?.overwriteLocal
          ? remoteHistory
          : mergeReadingHistories(currentLocal, remoteHistory);
        const mergedBookmarks = options?.overwriteLocal
          ? remote.bookmarkedIds || []
          : mergeBookmarkedIds(bookmarkedIdsRef.current, remote.bookmarkedIds || []);

        setReadingHistory(mergedHistory);
        if (mergedBookmarks.length > 0 || options?.overwriteLocal) {
          setBookmarkedIds(mergedBookmarks);
        }

        // If local device had newer or additional sessions not yet on the cloud backend, push merged state back
        if (
          !options?.overwriteLocal &&
          hasUnsyncedReadingChanges(mergedHistory, remoteHistory)
        ) {
          return await pushReadingHistoryToCloud(mergedHistory, mergedBookmarks, {
            syncKey: targetKey,
            mode: 'merge',
            announce: options?.announce,
          });
        }

        const syncedTime = remote.updatedAt || new Date().toISOString();
        setCloudSyncConfig((prev) => ({
          ...prev,
          syncKey: targetKey,
          lastSyncedAt: syncedTime,
          revision: remote.revision || prev.revision,
        }));
        setCloudSyncStatus('synced');

        if (options?.announce) {
          const count = Object.keys(mergedHistory).length;
          setCloudSyncNotice(
            `Pulled ${count} cloud reading session${count === 1 ? '' : 's'} from profile "${targetKey}" (Rev #${remote.revision || 1}).`
          );
        }
        return remote;
      } catch {
        setCloudSyncStatus('offline');
        return null;
      }
    },
    [cloudSyncConfig.syncKey, pushReadingHistoryToCloud]
  );

  // Initial Cloud Reading History hydration on mount & periodic cross-device sync
  useEffect(() => {
    void pullAndMergeCloudReadingHistory();

    if (!cloudSyncConfig.autoSync) return;
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      void pullAndMergeCloudReadingHistory();
    }, 8000);

    return () => clearInterval(interval);
  }, [cloudSyncConfig.syncKey, cloudSyncConfig.autoSync, pullAndMergeCloudReadingHistory]);

  // Quick URL Modal & GitHub Release Publisher Modal
  const [showUrlModal, setShowUrlModal] = useState(false);
  const [showGitHubReleaseModal, setShowGitHubReleaseModal] = useState(false);
  const [hasOpenedGitHubReleaseModal, setHasOpenedGitHubReleaseModal] = useState(false);
  const [modalUrlInput, setModalUrlInput] = useState('');
  const [modalFormat, setModalFormat] = useState<ArchiveFormat>('CBZ');
  const [modalError, setModalError] = useState<string | null>(null);

  // Power-user global keyboard shortcut system for primary navigation tabs (c, b, d, r, a, s & 1-6)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen(true);
        return;
      }

      const target = e.target as HTMLElement | null;
      const isEditableTarget = Boolean(
        target &&
          (target instanceof HTMLInputElement ||
            target instanceof HTMLTextAreaElement ||
            target instanceof HTMLSelectElement ||
            target.isContentEditable)
      );

      if (e.key === 'Escape') {
        if (showCloudSyncModal) {
          e.preventDefault();
          setShowCloudSyncModal(false);
          return;
        }
        if (showShortcutsModal) {
          e.preventDefault();
          setShowShortcutsModal(false);
          return;
        }
        if (showUrlModal) {
          e.preventDefault();
          setShowUrlModal(false);
          return;
        }
        if (inspectedSeries) {
          e.preventDefault();
          setInspectedSeries(null);
          return;
        }
        if (isEditableTarget && target) {
          target.blur();
          return;
        }
      }

      if (isEditableTarget) return;

      if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setShowShortcutsModal((prev) => !prev);
        return;
      }

      if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setActiveTab('browse');
        setTimeout(() => {
          const browseInput = document.querySelector<HTMLInputElement>(
            'input[aria-label="Search titles within selected source"]'
          );
          browseInput?.focus();
        }, 20);
        return;
      }

      const targetTab = resolvePrimaryNavShortcutTab(e.key, {
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        altKey: e.altKey,
        isEditableTarget,
      });

      if (targetTab) {
        e.preventDefault();
        setShowCloudSyncModal(false);
        setShowShortcutsModal(false);
        setShowUrlModal(false);
        setInspectedSeries(null);
        setActiveTab(targetTab === 'catalog' ? 'browse' : targetTab);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [showCloudSyncModal, showShortcutsModal, showUrlModal, inspectedSeries]);

  const enabledSources = useMemo<SourceId[]>(
    () =>
      Array.isArray(engineConfig.enabledSources) && engineConfig.enabledSources.length > 0
        ? engineConfig.enabledSources
        : DEFAULT_ENABLED_SOURCE_IDS,
    [engineConfig.enabledSources]
  );

  const enabledSourceModules = useMemo(
    () =>
      enabledSources
        .map((id) => ALL_FMD2_SOURCES.find((s) => s.id === id))
        .filter((s): s is NonNullable<typeof s> => Boolean(s)),
    [enabledSources]
  );

  // Reset activeSourceFilter to 'all' if user disables the currently selected source in Settings
  useEffect(() => {
    if (activeSourceFilter !== 'all' && !enabledSources.includes(activeSourceFilter)) {
      setActiveSourceFilter('all');
    }
  }, [enabledSources, activeSourceFilter]);

  // Poll the real server-side FMD2 Downloader Engine (/api/engine/state)
  const [visibleCatalogLimit, setVisibleCatalogLimit] = useState(28);

  useEffect(() => {
    setVisibleCatalogLimit(28);
  }, [searchQuery, activeSourceFilter, selectedGenre, libraryFilter]);

  useEffect(() => {
    let isMounted = true;
    let lastTasksHash = '';
    let lastConfigHash = '';

    const syncEngineState = async () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      try {
        const res = await fetch('/api/engine/state');
        if (!res.ok) return;
        const data = (await res.json()) as {
          tasks?: DownloadTask[];
          config?: FmdEngineConfig;
        };
        if (!isMounted) return;
        if (Array.isArray(data.tasks)) {
          const nextHash = JSON.stringify(data.tasks);
          if (nextHash !== lastTasksHash) {
            lastTasksHash = nextHash;
            setDownloadQueue(data.tasks);
          }
        }
        if (data.config) {
          const nextCfgHash = JSON.stringify(data.config);
          if (nextCfgHash !== lastConfigHash) {
            lastConfigHash = nextCfgHash;
            setEngineConfig(data.config);
          }
        }
      } catch {
        // Ignore transient network errors
      }
    };

    syncEngineState();
    const timer = setInterval(syncEngineState, 3500);
    return () => {
      isMounted = false;
      clearInterval(timer);
    };
  }, []);

  const handleMergeLiveSeries = useCallback((incoming: MangaSeries[]) => {
    if (!Array.isArray(incoming) || incoming.length === 0) return;
    setCatalog((prev) => {
      const byNormTitle = new Map<string, number>();
      const next = [...prev];
      for (let i = 0; i < next.length; i++) {
        byNormTitle.set(next[i].title.toLowerCase().replace(/[^a-z0-9]+/g, ''), i);
      }
      let changed = false;
      for (const item of incoming) {
        const norm = item.title.toLowerCase().replace(/[^a-z0-9]+/g, '');
        if (!norm) continue;
        const existingIdx = byNormTitle.get(norm);
        if (existingIdx === undefined) {
          byNormTitle.set(norm, next.length);
          next.push(item);
          changed = true;
        } else {
          const existing = next[existingIdx];
          const mergedSources = Array.from(
            new Set([...existing.availableSources, ...item.availableSources])
          );
          const nextChapters =
            item.chapters.length > existing.chapters.length
              ? item.chapters
              : existing.chapters;
          const nextTotal = Math.max(existing.totalChapters, item.totalChapters);
          if (
            mergedSources.length !== existing.availableSources.length ||
            nextChapters !== existing.chapters ||
            (!existing.coverUrl && item.coverUrl)
          ) {
            next[existingIdx] = {
              ...existing,
              availableSources: mergedSources,
              coverUrl: existing.coverUrl || item.coverUrl,
              chapters: nextChapters,
              totalChapters: nextTotal,
            };
            changed = true;
          }
        }
      }
      return changed ? next : prev;
    });
  }, []);

  // Hydrate catalog with real live data across verified sources on startup
  useEffect(() => {
    const controller = new AbortController();
    setIsInitialCatalogLoading(true);
    fetch('/api/manga/browse?sourceId=ALL&page=1', { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { results?: MangaSeries[] } | null) => {
        if (data && Array.isArray(data.results) && data.results.length > 0) {
          handleMergeLiveSeries(data.results);
          setActiveSeriesPage((prev) => prev || data.results![0]);
          setReaderSeries((prev) => prev || data.results![0]);
          setReaderChapter((prev) => {
            if (prev) return prev;
            const first = data.results![0];
            return first?.chapters[first.chapters.length - 1] || first?.chapters[0] || null;
          });
        }
      })
      .catch(() => {
        // Ignore abort/offline errors
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsInitialCatalogLoading(false);
        }
      });
    return () => controller.abort();
  }, [handleMergeLiveSeries]);

  const executeLiveSearch = useCallback(async (rawQuery: string, signal?: AbortSignal) => {
    const trimmed = rawQuery.trim();
    if (trimmed.length < 2) {
      setLiveSearchResults([]);
      setIsSearchingLive(false);
      return;
    }

    setIsSearchingLive(true);
    try {
      const res = await fetch(`/api/manga/live-search?q=${encodeURIComponent(trimmed)}`, {
        signal,
      });
      if (!res.ok) return;
      const data = (await res.json()) as { results?: MangaSeries[] };
      if (Array.isArray(data.results)) {
        setLiveSearchResults(data.results);
        if (data.results.length > 0) {
          setCatalog((prev) => {
            const existingTitles = new Set(prev.map((m) => m.title.toLowerCase()));
            const additions = data.results!.filter(
              (item) => !existingTitles.has(item.title.toLowerCase())
            );
            return additions.length > 0 ? [...prev, ...additions] : prev;
          });
        }
      }
    } catch {
      // Ignore abort/offline errors
    } finally {
      if (!signal?.aborted) {
        setIsSearchingLive(false);
      }
    }
  }, []);

  // Multi-source live query augmentation when typing
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (trimmed.length < 2) {
      setLiveSearchResults([]);
      setIsSearchingLive(false);
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => {
      void executeLiveSearch(trimmed, controller.signal);
    }, 220);

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [searchQuery, executeLiveSearch]);

  const selectedSourcesList = useMemo<SourceId[]>(
    () => (activeSourceFilter === 'all' ? enabledSources : [activeSourceFilter]),
    [activeSourceFilter, enabledSources]
  );

  const recentlyReadEntries = useMemo(
    () => getSortedRecentlyReadEntries(readingHistory, catalog),
    [readingHistory, catalog]
  );

  const filteredManga = useMemo(() => {
    const basePool =
      libraryFilter === 'saved'
        ? catalog.filter((m) => bookmarkedIds.includes(m.id))
        : libraryFilter === 'recent'
        ? recentlyReadEntries.map((entry) => entry.series)
        : catalog;

    const ranked = filterAndRankMangaCatalog(
      basePool,
      searchQuery,
      selectedSourcesList,
      selectedGenre
    );

    // Preserve most-recently-read order when filtering by 'recent' without an active search query
    if (libraryFilter === 'recent' && !searchQuery.trim()) {
      const orderMap = new Map<string, number>();
      recentlyReadEntries.forEach((entry, idx) => orderMap.set(entry.series.id, idx));
      return [...ranked].sort(
        (a, b) => (orderMap.get(a.id) ?? 9999) - (orderMap.get(b.id) ?? 9999)
      );
    }

    const trimmedQuery = searchQuery.trim();
    if (libraryFilter === 'all' && trimmedQuery.length >= 2) {
      // Merge live scraped results from WeebCentral.lua / LikeManga.lua / MangaDex.lua
      const merged: MangaSeries[] = [...ranked];
      const seenNormTitles = new Set(
        ranked.map((r) => r.title.toLowerCase().replace(/[^a-z0-9]+/g, ''))
      );

      for (const liveItem of liveSearchResults) {
        const norm = liveItem.title.toLowerCase().replace(/[^a-z0-9]+/g, '');
        if (!seenNormTitles.has(norm)) {
          seenNormTitles.add(norm);
          merged.push(liveItem);
        }
      }

      return merged;
    }

    return ranked;
  }, [
    catalog,
    liveSearchResults,
    libraryFilter,
    bookmarkedIds,
    recentlyReadEntries,
    searchQuery,
    selectedSourcesList,
    selectedGenre,
  ]);

  const queueStats = useMemo(() => summarizeDownloadQueue(downloadQueue), [downloadQueue]);

  const ensureSeriesInCatalog = (series: MangaSeries) => {
    setCatalog((prev) => (prev.some((m) => m.id === series.id) ? prev : [series, ...prev]));
  };

  const handleToggleBookmark = (mangaId: string) => {
    setBookmarkedIds((prev) => {
      const next = prev.includes(mangaId)
        ? prev.filter((id) => id !== mangaId)
        : [...prev, mangaId];
      if (cloudSyncConfig.autoSync) {
        void pushReadingHistoryToCloud(readingHistoryRef.current, next, {
          mode: 'overwrite',
        });
      }
      return next;
    });
  };

  const handleInspectSeries = (series: MangaSeries) => {
    ensureSeriesInCatalog(series);
    if (
      activeTab === 'catalog' ||
      activeTab === 'browse' ||
      activeTab === 'home' ||
      activeTab === 'read-later' ||
      activeTab === 'archivist'
    ) {
      setSeriesReturnTab(activeTab);
    }
    setActiveSeriesPage(series);
    setInspectedSeries(null);
    setActiveTab('series');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleToggleReadLaterChapter = useCallback(
    (series: MangaSeries, chapter: MangaChapter, sourceId?: SourceId) => {
      ensureSeriesInCatalog(series);
      setReadLaterQueue((prev) => {
        const res = toggleChapterInReadLaterQueue(prev, series, chapter, sourceId);
        return res.updatedQueue;
      });
    },
    []
  );

  const handleAddChapterToReadLater = useCallback(
    (series: MangaSeries, chapter: MangaChapter, sourceId?: SourceId) => {
      ensureSeriesInCatalog(series);
      setReadLaterQueue((prev) =>
        addChapterToReadLaterQueue(prev, series, chapter, sourceId)
      );
    },
    []
  );

  const handleRemoveFromReadLater = useCallback((itemId: string) => {
    setReadLaterQueue((prev) => removeChapterFromReadLaterQueue(prev, itemId));
  }, []);

  const handleMoveReadLaterItem = useCallback(
    (itemId: string, direction: 'up' | 'down' | 'top') => {
      setReadLaterQueue((prev) => moveReadLaterQueueItem(prev, itemId, direction));
    },
    []
  );

  const handleClearReadLaterQueue = useCallback(() => {
    setReadLaterQueue([]);
  }, []);

  const handleRecordReadingProgress = useCallback(
    (
      series: MangaSeries,
      chapter: MangaChapter,
      options?: {
        lastPage?: number;
        totalPages?: number;
        sourceId?: SourceId;
        readingMode?: ReadingMode;
      }
    ) => {
      const nowIso = new Date().toISOString();
      setReadingHistory((prev) => {
        const existing = getSeriesReadingProgress(prev, series);
        const isSameChapter =
          existing &&
          (existing.chapterId === chapter.id || existing.chapterNumber === chapter.number);
        const resolvedLastPage =
          options?.lastPage ?? (isSameChapter ? existing.lastPage : 1);
        const resolvedTotalPages =
          options?.totalPages ??
          (isSameChapter && existing.totalPages > 1
            ? existing.totalPages
            : chapter.pagesCount || 18);

        const nextHistory = upsertReadingProgress(prev, {
          seriesId: series.id,
          seriesTitle: series.title,
          chapterId: chapter.id,
          chapterNumber: chapter.number,
          chapterTitle: chapter.title,
          chapterExternalId: chapter.externalId,
          sourceId: options?.sourceId || chapter.sourceId || series.primarySource,
          lastPage: resolvedLastPage,
          totalPages: resolvedTotalPages,
          readingMode:
            options?.readingMode ||
            existing?.readingMode ||
            resolveSeriesReadingMode(series, engineConfig).mode,
          updatedAt: nowIso,
          deviceId: cloudSyncConfig.deviceId,
          deviceName: cloudSyncConfig.deviceName,
        });

        if (cloudSyncConfig.autoSync) {
          const updatedEntry = nextHistory[series.id];
          void pushReadingHistoryToCloud(nextHistory, bookmarkedIdsRef.current, {
            entry: updatedEntry,
            mode: 'merge',
          });
        } else {
          setCloudSyncStatus('pending');
        }

        return nextHistory;
      });
    },
    [
      engineConfig,
      cloudSyncConfig.autoSync,
      cloudSyncConfig.deviceId,
      cloudSyncConfig.deviceName,
      pushReadingHistoryToCloud,
    ]
  );

  const handleClearSeriesReadingProgress = useCallback(
    (seriesId: string) => {
      setReadingHistory((prev) => {
        const next = { ...prev };
        delete next[seriesId];
        return next;
      });
      void fetch(
        `/api/sync/reading-history?syncKey=${encodeURIComponent(
          cloudSyncConfig.syncKey
        )}&seriesId=${encodeURIComponent(seriesId)}`,
        {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            syncKey: cloudSyncConfig.syncKey,
            seriesId,
            deviceId: cloudSyncConfig.deviceId,
            deviceName: cloudSyncConfig.deviceName,
          }),
        }
      ).catch(() => {
        // Ignore transient offline error
      });
    },
    [cloudSyncConfig.syncKey, cloudSyncConfig.deviceId, cloudSyncConfig.deviceName]
  );

  const handleClearAllReadingProgress = useCallback(() => {
    setReadingHistory({});
    void fetch(
      `/api/sync/reading-history?syncKey=${encodeURIComponent(cloudSyncConfig.syncKey)}`,
      {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          syncKey: cloudSyncConfig.syncKey,
          deviceId: cloudSyncConfig.deviceId,
          deviceName: cloudSyncConfig.deviceName,
        }),
      }
    ).catch(() => {
      // Ignore transient offline error
    });
  }, [cloudSyncConfig.syncKey, cloudSyncConfig.deviceId, cloudSyncConfig.deviceName]);

  const handleReadChapter = (
    series: MangaSeries,
    chapter: MangaChapter,
    preferredMode?: ReadingMode,
    initialPage?: number
  ) => {
    ensureSeriesInCatalog(series);
    setReaderSeries(series);
    setReaderChapter(chapter);
    setReaderInitialMode(preferredMode || null);
    setReaderInitialPage(initialPage && initialPage > 1 ? initialPage : null);
    handleRecordReadingProgress(series, chapter, {
      lastPage: initialPage && initialPage > 1 ? initialPage : 1,
      readingMode: preferredMode,
    });
    setInspectedSeries(null);
    setActiveTab('reader');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleResumeSeries = (series: MangaSeries, progress: ReadingSessionProgress) => {
    const resumeChap = resolveResumeChapter(series, progress);
    const seriesWithSource: MangaSeries =
      progress.sourceId && series.primarySource !== progress.sourceId
        ? {
            ...series,
            primarySource: progress.sourceId,
            availableSources: series.availableSources.includes(progress.sourceId)
              ? series.availableSources
              : [progress.sourceId, ...series.availableSources],
          }
        : series;
    handleReadChapter(
      seriesWithSource,
      resumeChap,
      progress.readingMode,
      progress.lastPage
    );
  };

  const handleReadQueuedChapter = (
    item: ReadLaterItem,
    removeAfterOpen: boolean = false
  ) => {
    const matchedSeries = catalog.find((s) => s.id === item.seriesId);
    const targetChapter: MangaChapter = matchedSeries?.chapters.find(
      (c) => c.id === item.chapterId || c.number === item.chapterNumber
    ) || {
      id: item.chapterId,
      number: item.chapterNumber,
      title: item.chapterTitle,
      releaseDate: item.releaseDate,
      scanlationGroup: item.scanlationGroup,
      pagesCount: item.pagesCount,
      sourceId: item.sourceId,
      language: 'EN',
      externalId: item.chapterExternalId,
    };

    const targetSeries: MangaSeries = matchedSeries
      ? {
          ...matchedSeries,
          primarySource: item.sourceId || matchedSeries.primarySource,
          availableSources: matchedSeries.availableSources.includes(item.sourceId)
            ? matchedSeries.availableSources
            : [item.sourceId, ...matchedSeries.availableSources],
        }
      : {
          id: item.seriesId,
          slug: item.seriesId,
          title: item.seriesTitle,
          altTitles: [],
          author: 'FMD2 Live Author',
          artist: 'FMD2 Live Artist',
          status: 'Ongoing',
          year: 2026,
          rating: 4.8,
          demographic: 'Shounen',
          genres: ['Action', 'Adventure'],
          synopsis: `${item.seriesTitle} streamed from ${item.sourceId}.`,
          primarySource: item.sourceId,
          availableSources: [item.sourceId],
          totalChapters: Math.max(1, item.chapterNumber),
          coverTheme: 'shadow-monarch',
          chapters: [targetChapter],
        };

    const existingProg = getSeriesReadingProgress(readingHistory, targetSeries);
    const resumePage =
      existingProg && existingProg.chapterNumber === targetChapter.number
        ? existingProg.lastPage
        : 1;

    if (removeAfterOpen) {
      handleRemoveFromReadLater(item.id);
    }

    handleReadChapter(targetSeries, targetChapter, undefined, resumePage);
  };

  const handleQueueChapters = async (
    series: MangaSeries,
    chapters: MangaChapter[],
    sourceId: SourceId,
    format: ArchiveFormat
  ): Promise<{ downloadedFiles: string[] }> => {
    ensureSeriesInCatalog(series);
    if (chapters.length > 0) {
      setDownloadQueue((prev) =>
        enqueueChaptersForDownload(prev, series, chapters, sourceId, format)
      );
    }
    const res = await enqueueAndDownloadChapters({
      series,
      chapters,
      sourceId,
      format,
      triggerBrowserSave: true,
    });
    if (res.allTasks.length > 0) {
      setDownloadQueue(res.allTasks);
    }
    if (res.downloadedFiles.length > 0) {
      setGlobalDownloadNotice(
        `Downloaded ${res.downloadedFiles.join(', ')} (${format}) via FMD2 Engine`
      );
    } else if (chapters.length > 0) {
      setGlobalDownloadNotice(
        `Added ${chapters.length} chapter${chapters.length === 1 ? '' : 's'} of ${series.title} (${format}) to download queue`
      );
    }
    return { downloadedFiles: res.downloadedFiles };
  };

  const handleGrabDirectUrl = async (
    rawUrl: string,
    format: ArchiveFormat
  ): Promise<{ ok: boolean; message: string; addedTasks?: DownloadTask[] }> => {
    try {
      const res = await fetch('/api/engine/enqueue-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: rawUrl, format }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        message?: string;
        series?: MangaSeries;
        addedTasks?: DownloadTask[];
        tasks?: DownloadTask[];
      };

      if (Array.isArray(data.tasks)) {
        setDownloadQueue(data.tasks);
      }
      if (data.series) {
        ensureSeriesInCatalog(data.series);
      }

      return {
        ok: Boolean(data.ok),
        message: data.message || (res.ok ? 'Queued URL in FMD2 Engine.' : 'Invalid URL.'),
        addedTasks: data.addedTasks,
      };
    } catch {
      return {
        ok: false,
        message: 'Could not reach server-side FMD2 Downloader Engine.',
      };
    }
  };

  const handleTaskControl = async (
    taskId: string,
    action: 'toggle' | 'remove' | 'retry' | 'completeNow'
  ) => {
    try {
      const res = await fetch('/api/engine/task-control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, action }),
      });
      if (res.ok) {
        const data = (await res.json()) as { tasks?: DownloadTask[] };
        if (Array.isArray(data.tasks)) {
          setDownloadQueue(data.tasks);
        }
      }
    } catch {
      // Ignore error
    }
  };

  const handleBatchControl = async (action: 'startAll' | 'pauseAll' | 'clearCompleted') => {
    try {
      const res = await fetch('/api/engine/batch-control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        const data = (await res.json()) as { tasks?: DownloadTask[] };
        if (Array.isArray(data.tasks)) {
          setDownloadQueue(data.tasks);
        }
      }
    } catch {
      // Ignore error
    }
  };

  const handleUpdateEngineConfig = async (partial: Partial<FmdEngineConfig>) => {
    setEngineConfig((prev) => ({ ...prev, ...partial }));
    try {
      const res = await fetch('/api/engine/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(partial),
      });
      if (res.ok) {
        const data = (await res.json()) as {
          tasks?: DownloadTask[];
          config?: FmdEngineConfig;
        };
        if (data.config) setEngineConfig(data.config);
        if (Array.isArray(data.tasks)) setDownloadQueue(data.tasks);
      }
    } catch {
      // Ignore error
    }
  };

  const handleToggleSourceInSettings = (sourceId: SourceId) => {
    const isCurrentlyEnabled = enabledSources.includes(sourceId);
    let nextSources: SourceId[];
    if (isCurrentlyEnabled) {
      if (enabledSources.length <= 1) return; // Keep at least 1 source active
      nextSources = enabledSources.filter((id) => id !== sourceId);
    } else {
      nextSources = [...enabledSources, sourceId];
    }
    handleUpdateEngineConfig({ enabledSources: nextSources });
  };

  const handleSetEnabledSources = (sourceIds: SourceId[]) => {
    const safeList = sourceIds.length > 0 ? sourceIds : [...DEFAULT_ENABLED_SOURCE_IDS];
    handleUpdateEngineConfig({ enabledSources: safeList });
  };

  const handleModalUrlSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await handleGrabDirectUrl(modalUrlInput, modalFormat);
    if (!res.ok) {
      setModalError(res.message);
      return;
    }
    if (Array.isArray(res.addedTasks) && res.addedTasks.length > 0) {
      const dl = await triggerBrowserFileDownload(res.addedTasks[0]);
      if (dl.ok) {
        setGlobalDownloadNotice(
          `Downloaded "${dl.fileName}" (${(dl.bytes / 1024).toFixed(1)} KB) from URL`
        );
      }
    }
    setModalError(null);
    setModalUrlInput('');
    setShowUrlModal(false);
    setActiveTab('downloads');
  };

  const handleSearchFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLibraryFilter('all');
    if (searchQuery.trim().length >= 2) {
      void executeLiveSearch(searchQuery);
    }
  };

  const featuredSpotlight = catalog[0];
  const featuredSpotlightProgress = featuredSpotlight
    ? getSeriesReadingProgress(readingHistory, featuredSpotlight)
    : null;
  const featuredSpotlightMissing = useMemo(
    () =>
      featuredSpotlight
        ? resolveMissingChaptersForBatch(featuredSpotlight.chapters, {
            existingTasks: downloadQueue,
            seriesId: featuredSpotlight.id,
            seriesTitle: featuredSpotlight.title,
          })
        : [],
    [featuredSpotlight, downloadQueue]
  );

  const handleQuickBatchDownloadSeries = async (series: MangaSeries) => {
    const missing = resolveMissingChaptersForBatch(series.chapters, {
      existingTasks: downloadQueue,
      seriesId: series.id,
      seriesTitle: series.title,
    });
    if (missing.length === 0) {
      setGlobalDownloadNotice(`All chapters of ${series.title} are already in the download queue.`);
      return;
    }
    await handleQueueChapters(
      series,
      missing,
      series.primarySource,
      engineConfig.defaultFormat
    );
  };

  const visibleCatalogSeries = useMemo(
    () => filteredManga.slice(0, visibleCatalogLimit),
    [filteredManga, visibleCatalogLimit]
  );

  const allVisibleCatalogSelected = useMemo(
    () => areAllCatalogSeriesSelected(selectedCatalogSeriesIds, visibleCatalogSeries),
    [selectedCatalogSeriesIds, visibleCatalogSeries]
  );

  const bulkCatalogSelectionStats = useMemo(() => {
    const combinedPoolMap = new Map<string, MangaSeries>();
    for (const s of catalog) combinedPoolMap.set(s.id, s);
    for (const s of filteredManga) combinedPoolMap.set(s.id, s);
    return computeCatalogBulkSelectionStats(
      Array.from(combinedPoolMap.values()),
      selectedCatalogSeriesIds,
      downloadQueue
    );
  }, [catalog, filteredManga, selectedCatalogSeriesIds, downloadQueue]);

  const handleToggleCatalogSeriesSelect = useCallback((seriesId: string) => {
    setSelectedCatalogSeriesIds((prev) => toggleCatalogSeriesSelection(prev, seriesId));
  }, []);

  const handleToggleSelectAllCatalog = useCallback(() => {
    setSelectedCatalogSeriesIds((prev) =>
      toggleSelectAllCatalogSeries(prev, visibleCatalogSeries)
    );
  }, [visibleCatalogSeries]);

  const handleClearCatalogSelection = useCallback(() => {
    setSelectedCatalogSeriesIds([]);
  }, []);

  const handleBulkQueueSelectedSeries = async () => {
    if (selectedCatalogSeriesIds.length === 0 || isBulkQueueingCatalog) return;
    const selectedSet = new Set(selectedCatalogSeriesIds);
    const combinedPoolMap = new Map<string, MangaSeries>();
    for (const s of catalog) combinedPoolMap.set(s.id, s);
    for (const s of filteredManga) combinedPoolMap.set(s.id, s);

    const selectedSeriesList = Array.from(combinedPoolMap.values()).filter((s) =>
      selectedSet.has(s.id)
    );
    if (selectedSeriesList.length === 0) return;

    setIsBulkQueueingCatalog(true);
    try {
      const bulkResult = enqueueMultipleSeriesForDownload(
        downloadQueue,
        selectedSeriesList,
        engineConfig.defaultFormat
      );

      if (bulkResult.addedChaptersCount === 0) {
        setGlobalDownloadNotice(
          `All chapters for the ${selectedSeriesList.length} selected series are already in the download queue.`
        );
        return;
      }

      setDownloadQueue(bulkResult.updatedQueue);

      let latestServerTasks: DownloadTask[] = [];
      for (let i = 0; i < bulkResult.queuedEntries.length; i++) {
        const entry = bulkResult.queuedEntries[i];
        ensureSeriesInCatalog(entry.series);
        const res = await enqueueAndDownloadChapters({
          series: entry.series,
          chapters: entry.chapters,
          sourceId: entry.sourceId,
          format: engineConfig.defaultFormat,
          triggerBrowserSave: i === 0 && engineConfig.autoDownloadToBrowser,
        });
        if (res.allTasks.length > 0) {
          latestServerTasks = res.allTasks;
        }
      }

      if (latestServerTasks.length > 0) {
        setDownloadQueue(latestServerTasks);
      }

      setGlobalDownloadNotice(
        `Bulk queued ${bulkResult.addedChaptersCount} chapter${
          bulkResult.addedChaptersCount === 1 ? '' : 's'
        } across ${bulkResult.queuedSeriesCount} manga series (${engineConfig.defaultFormat})`
      );
      setSelectedCatalogSeriesIds([]);
    } finally {
      setIsBulkQueueingCatalog(false);
    }
  };

  const activeNavigationTab =
    activeTab === 'series' ? seriesReturnTab : activeTab;

  const navigateToHomeSection = (sectionId?: string) => {
    setActiveTab('home');
    setActiveHomeSection(sectionId || 'browse');
    if (sectionId) {
      window.setTimeout(() => {
        document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 50);
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const desktopNavItems = [
    { label: 'Browse', icon: Home, action: () => navigateToHomeSection(), active: activeNavigationTab === 'home' && activeHomeSection === 'browse' },
    { label: 'Trending', icon: TrendingUp, action: () => navigateToHomeSection('trending'), active: activeNavigationTab === 'home' && activeHomeSection === 'trending' },
    { label: 'Authors', icon: UserRound, action: () => navigateToHomeSection('authors'), active: activeNavigationTab === 'home' && activeHomeSection === 'authors' },
    { label: 'Collections', icon: Layers, action: () => navigateToHomeSection('top-lists'), active: activeNavigationTab === 'home' && activeHomeSection === 'top-lists' },
    { label: 'Groups', icon: UsersRound, action: () => navigateToHomeSection('community'), active: activeNavigationTab === 'home' && activeHomeSection === 'community' },
  ];

  const libraryNavItems = [
    { label: 'All titles', icon: BookOpen, tab: 'catalog' as ActiveTab, active: activeNavigationTab === 'catalog' || activeNavigationTab === 'browse' },
    { label: 'Read later', icon: Bookmark, tab: 'read-later' as ActiveTab, active: activeNavigationTab === 'read-later', count: readLaterQueue.length },
    { label: 'Downloads', icon: Download, tab: 'downloads' as ActiveTab, active: activeNavigationTab === 'downloads', count: queueStats.totalTasks },
    { label: 'Reader', icon: BookOpen, tab: 'reader' as ActiveTab, active: activeNavigationTab === 'reader' },
  ];

  return (
    <div
      data-theme={themePrefs.themeId}
      data-theme-mode={activeThemePreset.mode}
      data-accent={themePrefs.accentId !== 'theme-default' ? themePrefs.accentId : undefined}
      data-font={themePrefs.fontFamily}
      data-motion={themePrefs.animationStyle}
      data-surface={themePrefs.surfaceStyle}
      data-hover={themePrefs.cardHoverEffects ? 'enabled' : 'disabled'}
      data-ambient-glow={themePrefs.ambientGlow ? 'enabled' : 'disabled'}
      className={`relative min-h-screen bg-[#090A0F] text-[#F1F5F9] ${
        themePrefs.ambientGlow ? 'studio-ambient-glow' : ''
      }`}
    >
      {/* Interactive Mouse Pointer Ring, Click Ripples & Ambient Spotlight */}
      <InteractiveCursorOverlay
        enabled={
          themePrefs.cursorAnimation !== false &&
          themePrefs.animationStyle !== 'minimal'
        }
        ambientSpotlight={themePrefs.ambientGlow}
      />

      {activeTab !== 'reader' && (
        <aside className={`fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-white/[0.06] bg-[#0B0C12] transition-[width] duration-200 lg:flex ${isSidebarCollapsed ? 'w-[76px]' : 'w-[248px]'}`}>
          <div className={`flex h-[72px] items-center border-b border-white/[0.06] ${isSidebarCollapsed ? 'justify-center px-2' : 'justify-between px-5'}`}>
            <button type="button" onClick={() => navigateToHomeSection()} className="flex min-w-0 items-center gap-3 text-left" aria-label="FMD2 Studio home">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-violet-500 to-rose-500 text-sm font-black text-white shadow-[0_8px_25px_-10px_rgba(124,58,237,.9)]">F</span>
              {!isSidebarCollapsed && <span className="min-w-0"><span className="block font-display text-sm font-bold tracking-tight text-white">FMD2 Studio</span><span className="mt-0.5 block text-[8px] font-bold uppercase tracking-[0.2em] text-white/30">READ · SAVE · DISCOVER</span></span>}
            </button>
            {!isSidebarCollapsed && <button type="button" onClick={() => setIsSidebarCollapsed(true)} className="grid h-8 w-8 place-items-center rounded-lg text-white/35 transition-colors hover:bg-white/[0.05] hover:text-white" aria-label="Collapse sidebar"><ChevronLeft className="h-4 w-4" /></button>}
          </div>

          {isSidebarCollapsed && <button type="button" onClick={() => setIsSidebarCollapsed(false)} className="mx-auto mt-3 grid h-8 w-8 place-items-center rounded-lg text-white/35 transition-colors hover:bg-white/[0.05] hover:text-white" aria-label="Expand sidebar"><ChevronRight className="h-4 w-4" /></button>}

          <div className={`flex-1 overflow-y-auto py-5 ${isSidebarCollapsed ? 'px-2' : 'px-3'}`}>
            {!isSidebarCollapsed && <p className="mb-2 px-3 text-[9px] font-bold uppercase tracking-[0.18em] text-white/25">Discover</p>}
            <nav aria-label="Discovery" className="space-y-1">
              {desktopNavItems.map(({ label, icon: Icon, action, active }) => (
                <button key={label} type="button" onClick={action} aria-current={active ? 'page' : undefined} title={isSidebarCollapsed ? label : undefined} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[11px] font-semibold transition-colors ${isSidebarCollapsed ? 'justify-center' : ''} ${active ? 'bg-violet-500/12 text-violet-100 ring-1 ring-violet-400/10' : 'text-white/45 hover:bg-white/[0.04] hover:text-white/85'}`}>
                  <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-violet-200' : ''}`} />{!isSidebarCollapsed && <span>{label}</span>}
                </button>
              ))}
            </nav>

            <div className="my-5 border-t border-white/[0.06]" />
            {!isSidebarCollapsed && <p className="mb-2 px-3 text-[9px] font-bold uppercase tracking-[0.18em] text-white/25">Your library</p>}
            <nav aria-label="Library" className="space-y-1">
              {libraryNavItems.map(({ label, icon: Icon, tab, active, count }) => (
                <button key={label} type="button" onClick={() => setActiveTab(tab)} aria-current={active ? 'page' : undefined} title={isSidebarCollapsed ? label : undefined} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[11px] font-semibold transition-colors ${isSidebarCollapsed ? 'justify-center' : ''} ${active ? 'bg-white/[0.06] text-white' : 'text-white/40 hover:bg-white/[0.04] hover:text-white/80'}`}>
                  <Icon className="h-4 w-4 shrink-0" />{!isSidebarCollapsed && <><span className="flex-1">{label}</span>{typeof count === 'number' && count > 0 && <span className="rounded-md bg-white/[0.07] px-1.5 py-0.5 text-[9px] tabular-nums text-white/55">{count}</span>}</>}
                </button>
              ))}
            </nav>
          </div>

          <div className={`border-t border-white/[0.06] py-3 ${isSidebarCollapsed ? 'px-2' : 'px-3'}`}>
            <button type="button" onClick={() => setActiveTab('archivist')} title={isSidebarCollapsed ? 'Archivist AI' : undefined} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[11px] font-semibold text-white/40 transition-colors hover:bg-white/[0.04] hover:text-white/85 ${isSidebarCollapsed ? 'justify-center' : ''}`}><Sparkles className="h-4 w-4 shrink-0 text-rose-200" />{!isSidebarCollapsed && <span className="flex-1">Archivist AI</span>}</button>
            <button type="button" onClick={() => setActiveTab('settings')} title={isSidebarCollapsed ? 'Settings' : undefined} aria-current={activeNavigationTab === 'settings' ? 'page' : undefined} className={`mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[11px] font-semibold transition-colors ${isSidebarCollapsed ? 'justify-center' : ''} ${activeNavigationTab === 'settings' ? 'bg-white/[0.06] text-white' : 'text-white/40 hover:bg-white/[0.04] hover:text-white/85'}`}><Settings2 className="h-4 w-4 shrink-0" />{!isSidebarCollapsed && <span>Settings</span>}</button>
          </div>
        </aside>
      )}

      {activeTab !== 'reader' && (
        <header className={`sticky top-0 z-30 flex h-[72px] items-center justify-between gap-4 border-b border-white/[0.06] bg-[#090A0F]/80 px-4 backdrop-blur-xl sm:px-6 ${isSidebarCollapsed ? 'lg:pl-[100px]' : 'lg:pl-[272px]'}`}>
          <div className="min-w-0">
            <p className="text-[8px] font-bold uppercase tracking-[0.2em] text-white/30">FMD2 STUDIO <span className="mx-1 text-white/15">/</span> {activeNavigationTab.toUpperCase().replace('-', ' ')}</p>
            <h1 className="mt-1 truncate font-display text-sm font-bold tracking-tight text-white sm:text-base">{activeTab === 'series' ? 'Series details' : activeNavigationTab === 'home' ? 'Discover stories' : activeNavigationTab === 'catalog' || activeNavigationTab === 'browse' ? 'All titles' : activeNavigationTab === 'read-later' ? 'Read later' : activeNavigationTab === 'downloads' ? 'Downloads' : activeNavigationTab === 'reader' ? 'Reader' : activeNavigationTab === 'archivist' ? 'Archivist' : 'Settings'}</h1>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button type="button" onClick={() => setIsCommandPaletteOpen(true)} className="group flex h-9 items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.025] px-3 text-white/45 transition-colors hover:border-violet-300/25 hover:text-white/85" aria-label="Search titles, authors, and users">
              <Search className="h-3.5 w-3.5" /><span className="hidden text-[10px] sm:inline">Search anything</span><kbd className="hidden rounded border border-white/10 px-1 py-0.5 text-[8px] text-white/30 sm:inline">Ctrl K</kbd>
            </button>
            <button type="button" onClick={() => { setModalError(null); setShowUrlModal(true); }} className="inline-flex h-9 items-center gap-2 rounded-lg bg-violet-500 px-3 text-[10px] font-bold text-white transition-colors hover:bg-violet-400"><span className="text-base leading-none">+</span><span className="hidden sm:inline">Add series</span></button>
          </div>
        </header>
      )}

      {/* Strict 3-Zone Top Bar Contract */}
      <header className="hidden">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#browse"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('browse');
          }}
          className="text-lg font-bold tracking-tight text-white font-display whitespace-nowrap shrink-0"
        >
          FMD2 Studio
        </a>

        {/* Zone 2: Clean single-line text navigation links */}
        <nav
          aria-label="Primary Navigation"
          className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-400"
        >
          <button
            type="button"
            onClick={() => setActiveTab('browse')}
            aria-keyshortcuts="b 1 2"
            aria-current={
              activeNavigationTab === 'browse' || activeNavigationTab === 'catalog'
                ? 'page'
                : undefined
            }
            title="Browse Sources (Home)"
            className={`studio-nav-tab py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeNavigationTab === 'browse' || activeNavigationTab === 'catalog'
                ? 'text-white'
                : 'hover:text-white'
            }`}
          >
            Browse Sources
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('read-later')}
            aria-keyshortcuts="l 7"
            aria-current={activeNavigationTab === 'read-later' ? 'page' : undefined}
            title="Read Later Chapter Queue (Shortcut: L)"
            data-testid="nav-read-later-tab"
            className={`studio-nav-tab py-1 transition-colors whitespace-nowrap shrink-0 tabular-nums cursor-pointer ${
              activeNavigationTab === 'read-later'
                ? 'text-white'
                : 'hover:text-white'
            }`}
          >
            Read Later ({readLaterQueue.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('downloads')}
            aria-keyshortcuts="d 3"
            aria-current={activeNavigationTab === 'downloads' ? 'page' : undefined}
            title="Downloads (Shortcut: D)"
            className={`studio-nav-tab py-1 transition-colors whitespace-nowrap shrink-0 tabular-nums cursor-pointer ${
              activeNavigationTab === 'downloads'
                ? 'text-white'
                : 'hover:text-white'
            }`}
          >
            Downloads ({queueStats.totalTasks})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('reader')}
            aria-keyshortcuts="r 4"
            aria-current={activeNavigationTab === 'reader' ? 'page' : undefined}
            title="Manga Reader (Shortcut: R)"
            className={`studio-nav-tab py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeNavigationTab === 'reader'
                ? 'text-white'
                : 'hover:text-white'
            }`}
          >
            Manga Reader
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('archivist')}
            aria-keyshortcuts="a 5"
            aria-current={activeNavigationTab === 'archivist' ? 'page' : undefined}
            title="Archivist AI (Shortcut: A)"
            className={`studio-nav-tab py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeNavigationTab === 'archivist'
                ? 'text-white'
                : 'hover:text-white'
            }`}
          >
            Archivist
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            aria-keyshortcuts="s 6"
            aria-current={activeNavigationTab === 'settings' ? 'page' : undefined}
            title="Settings (Shortcut: S)"
            className={`studio-nav-tab py-1 transition-colors whitespace-nowrap shrink-0 tabular-nums cursor-pointer ${
              activeNavigationTab === 'settings'
                ? 'text-white'
                : 'hover:text-white'
            }`}
          >
            Settings
          </button>
        </nav>

        {/* Zone 3: Quick Actions */}
        <div className="flex items-center gap-2.5 shrink-0">
          {!IS_PACKAGED_RELEASE && (
            <button
              type="button"
              onClick={() => {
                setHasOpenedGitHubReleaseModal(true);
                setShowGitHubReleaseModal(true);
              }}
              className="px-3.5 py-2 text-xs font-semibold text-slate-200 hover:text-white bg-[#0F1523] hover:bg-slate-800 border border-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Publish Release
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setModalError(null);
              setShowUrlModal(true);
            }}
            className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-sm transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Paste Manga URL
          </button>
        </div>
      </header>

      {/* Mobile Navigation Bar */}
      <nav
        aria-label="Mobile Navigation"
        className="hidden"
      >
        <button
          type="button"
          onClick={() => setActiveTab('browse')}
          aria-keyshortcuts="b 1 2"
          aria-current={
            activeNavigationTab === 'browse' || activeNavigationTab === 'catalog'
              ? 'page'
              : undefined
          }
          className={`px-2.5 py-1 rounded-md whitespace-nowrap shrink-0 ${
            activeNavigationTab === 'browse' || activeNavigationTab === 'catalog'
              ? 'bg-indigo-600 text-white'
              : 'hover:text-white'
          }`}
        >
          Browse Sources
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('read-later')}
          aria-keyshortcuts="l 7"
          aria-current={activeNavigationTab === 'read-later' ? 'page' : undefined}
          className={`px-2.5 py-1 rounded-md tabular-nums whitespace-nowrap shrink-0 ${
            activeNavigationTab === 'read-later' ? 'bg-indigo-600 text-white' : 'hover:text-white'
          }`}
        >
          Read Later ({readLaterQueue.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('downloads')}
          aria-keyshortcuts="d 3"
          aria-current={activeNavigationTab === 'downloads' ? 'page' : undefined}
          className={`px-2.5 py-1 rounded-md tabular-nums whitespace-nowrap shrink-0 ${
            activeNavigationTab === 'downloads' ? 'bg-indigo-600 text-white' : 'hover:text-white'
          }`}
        >
          Downloads ({queueStats.totalTasks})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('reader')}
          aria-keyshortcuts="r 4"
          aria-current={activeNavigationTab === 'reader' ? 'page' : undefined}
          className={`px-2.5 py-1 rounded-md whitespace-nowrap shrink-0 ${
            activeNavigationTab === 'reader' ? 'bg-indigo-600 text-white' : 'hover:text-white'
          }`}
        >
          Reader
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('archivist')}
          aria-keyshortcuts="a 5"
          aria-current={activeNavigationTab === 'archivist' ? 'page' : undefined}
          className={`px-2.5 py-1 rounded-md whitespace-nowrap shrink-0 ${
            activeNavigationTab === 'archivist' ? 'bg-indigo-600 text-white' : 'hover:text-white'
          }`}
        >
          Archivist
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('settings')}
          aria-keyshortcuts="s 6"
          aria-current={activeNavigationTab === 'settings' ? 'page' : undefined}
          className={`px-2.5 py-1 rounded-md whitespace-nowrap shrink-0 ${
            activeNavigationTab === 'settings' ? 'bg-indigo-600 text-white' : 'hover:text-white'
          }`}
        >
          Settings
        </button>
      </nav>

      {/* Main Workspace Container */}
      <main
        className={activeTab === 'reader'
          ? 'flex-1 w-full min-w-0'
          : `min-h-[calc(100vh-72px)] w-full min-w-0 px-4 py-5 pb-28 sm:px-6 lg:px-8 lg:py-7 lg:pb-10 ${isSidebarCollapsed ? 'lg:ml-[76px] lg:w-[calc(100%-76px)]' : 'lg:ml-[248px] lg:w-[calc(100%-248px)]'}`}
      >
        {globalDownloadNotice && (
          <div
            role="status"
            className="mb-6 bg-emerald-950/75 border border-emerald-700/70 text-emerald-200 px-4 py-3 rounded-xl flex flex-wrap items-center justify-between gap-4 text-xs"
          >
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{globalDownloadNotice}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveTab('downloads')}
                className="px-3 py-1 bg-emerald-700/70 hover:bg-emerald-600 text-white font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                View Downloads ({queueStats.totalTasks})
              </button>
              <button
                type="button"
                onClick={() => setGlobalDownloadNotice(null)}
                className="text-emerald-400 hover:text-white px-2 py-0.5 rounded cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        <React.Suspense fallback={<WorkspaceLoadingFallback />}>
          <div
            key={
              activeTab === 'series'
                ? `series-${activeSeriesPage?.id || 'empty'}`
                : activeTab
            }
            className="animate-view-enter"
          >
        {(activeTab === 'browse' || activeTab === 'catalog') && (
          <BrowseSourcesView
            catalog={catalog}
            enabledSources={enabledSources}
            engineConfig={engineConfig}
            readingHistory={readingHistory}
            recentlyReadEntries={recentlyReadEntries}
            onResumeSeries={handleResumeSeries}
            onClearReadingProgress={handleClearSeriesReadingProgress}
            onClearAllReadingProgress={handleClearAllReadingProgress}
            onOpenCloudSync={() => setShowCloudSyncModal(true)}
            cloudSyncStatus={cloudSyncStatus}
            externalSearchQuery={searchQuery}
            onToggleEnableSource={handleToggleSourceInSettings}
            onReadSeriesOnSource={(series, sourceId) => {
              const seriesWithSource: MangaSeries = {
                ...series,
                primarySource: sourceId,
                availableSources: series.availableSources.includes(sourceId)
                  ? series.availableSources
                  : [sourceId, ...series.availableSources],
              };
              const firstChap =
                seriesWithSource.chapters[seriesWithSource.chapters.length - 1] ||
                seriesWithSource.chapters[0];
              if (firstChap) {
                handleReadChapter(seriesWithSource, firstChap);
              }
            }}
            onInspectSeries={handleInspectSeries}
            onMergeLiveSeries={handleMergeLiveSeries}
          />
        )}

        {activeTab === 'home' && (
          <DiscoverHomeView
            catalog={catalog}
            recentlyReadEntries={recentlyReadEntries}
            bookmarkedIds={bookmarkedIds}
            isLoading={isInitialCatalogLoading}
            onResumeSeries={handleResumeSeries}
            onInspectSeries={handleInspectSeries}
            onReadChapter={handleReadChapter}
            onToggleBookmark={handleToggleBookmark}
            onBrowseAll={() => setActiveTab('catalog')}
            onOpenSearch={() => setIsCommandPaletteOpen(true)}
          />
        )}

        {activeTab === 'read-later' && (
          <ReadLaterQueueView
            queue={readLaterQueue}
            catalog={catalog}
            bookmarkedIds={bookmarkedIds}
            readingHistory={readingHistory}
            defaultFormat={engineConfig.defaultFormat}
            onReadQueuedChapter={handleReadQueuedChapter}
            onRemoveFromQueue={handleRemoveFromReadLater}
            onMoveQueueItem={handleMoveReadLaterItem}
            onClearQueue={handleClearReadLaterQueue}
            onAddChapterToQueue={handleAddChapterToReadLater}
            onInspectSeries={handleInspectSeries}
            onDownloadQueuedItem={async (item) => {
              const matchedSeries: MangaSeries =
                catalog.find((s) => s.id === item.seriesId) || {
                  id: item.seriesId,
                  slug: item.seriesId,
                  title: item.seriesTitle,
                  altTitles: [],
                  author: 'FMD2 Live Author',
                  artist: 'FMD2 Live Artist',
                  status: 'Ongoing' as const,
                  year: 2026,
                  rating: 4.8,
                  demographic: 'Shounen',
                  genres: ['Action'],
                  synopsis: '',
                  primarySource: item.sourceId,
                  availableSources: [item.sourceId],
                  totalChapters: item.chapterNumber,
                  coverTheme: 'shadow-monarch',
                  chapters: [],
                };
              const targetChapter: MangaChapter = {
                id: item.chapterId,
                number: item.chapterNumber,
                title: item.chapterTitle,
                releaseDate: item.releaseDate,
                scanlationGroup: item.scanlationGroup,
                pagesCount: item.pagesCount,
                sourceId: item.sourceId,
                language: 'EN',
                externalId: item.chapterExternalId,
              };
              await handleQueueChapters(
                matchedSeries,
                [targetChapter],
                item.sourceId,
                engineConfig.defaultFormat
              );
            }}
            onDownloadAllQueued={async () => {
              for (const item of readLaterQueue) {
                const matchedSeries: MangaSeries =
                  catalog.find((s) => s.id === item.seriesId) || {
                    id: item.seriesId,
                    slug: item.seriesId,
                    title: item.seriesTitle,
                    altTitles: [],
                    author: 'FMD2 Live Author',
                    artist: 'FMD2 Live Artist',
                    status: 'Ongoing' as const,
                    year: 2026,
                    rating: 4.8,
                    demographic: 'Shounen',
                    genres: ['Action'],
                    synopsis: '',
                    primarySource: item.sourceId,
                    availableSources: [item.sourceId],
                    totalChapters: item.chapterNumber,
                    coverTheme: 'shadow-monarch',
                    chapters: [],
                  };
                const targetChapter: MangaChapter = {
                  id: item.chapterId,
                  number: item.chapterNumber,
                  title: item.chapterTitle,
                  releaseDate: item.releaseDate,
                  scanlationGroup: item.scanlationGroup,
                  pagesCount: item.pagesCount,
                  sourceId: item.sourceId,
                  language: 'EN',
                  externalId: item.chapterExternalId,
                };
                await handleQueueChapters(
                  matchedSeries,
                  [targetChapter],
                  item.sourceId,
                  engineConfig.defaultFormat
                );
              }
            }}
            onOpenReaderTab={() => setActiveTab('reader')}
            onOpenCatalogTab={() => setActiveTab('browse')}
          />
        )}

        {activeTab === 'series' && activeSeriesPage && (
          <MangaSeriesPage
            series={activeSeriesPage}
            catalog={catalog}
            enabledSources={enabledSources}
            engineConfig={engineConfig}
            onUpdateEngineConfig={handleUpdateEngineConfig}
            readingProgress={getSeriesReadingProgress(readingHistory, activeSeriesPage)}
            readingHistory={readingHistory}
            onResumeReading={handleResumeSeries}
            existingTasks={downloadQueue}
            isBookmarked={bookmarkedIds.includes(activeSeriesPage.id)}
            onToggleBookmark={handleToggleBookmark}
            onBack={() =>
              setActiveTab(seriesReturnTab === 'catalog' ? 'browse' : seriesReturnTab)
            }
            backLabel={
              seriesReturnTab === 'read-later'
                ? 'Back to Read Later Queue'
                : seriesReturnTab === 'archivist'
                ? 'Back to Archivist AI'
                : seriesReturnTab === 'home'
                ? 'Back to Discover'
                : 'Back to Browse Sources'
            }
            onSelectSeries={handleInspectSeries}
            onReadChapter={handleReadChapter}
            onQueueChapters={handleQueueChapters}
            onOpenDownloadsTab={() => setActiveTab('downloads')}
            readLaterQueue={readLaterQueue}
            onToggleReadLaterChapter={handleToggleReadLaterChapter}
          />
        )}

        {activeTab === 'downloads' && (
          <DownloadManagerView
            tasks={downloadQueue}
            engineConfig={engineConfig}
            onUpdateEngineConfig={handleUpdateEngineConfig}
            onToggleTaskStatus={(taskId) => handleTaskControl(taskId, 'toggle')}
            onCompleteTaskNow={(taskId) => handleTaskControl(taskId, 'completeNow')}
            onRemoveTask={(taskId) => handleTaskControl(taskId, 'remove')}
            onStartAll={() => handleBatchControl('startAll')}
            onPauseAll={() => handleBatchControl('pauseAll')}
            onClearCompleted={() => handleBatchControl('clearCompleted')}
            onGrabDirectUrl={handleGrabDirectUrl}
          />
        )}

        {activeTab === 'reader' &&
          (readerSeries && readerChapter ? (
            <MangaReaderView
              series={readerSeries}
              chapter={readerChapter}
              initialReadingMode={readerInitialMode}
              initialPageNumber={readerInitialPage}
              allSeries={catalog}
              engineConfig={engineConfig}
              onUpdateEngineConfig={handleUpdateEngineConfig}
              onSelectChapter={(ch) => {
                setReaderInitialPage(null);
                setReaderChapter(ch);
              }}
              onSelectSeriesAndChapter={handleReadChapter}
              onUpdateReadingProgress={(prog) => {
                handleRecordReadingProgress(readerSeries, prog.chapter, {
                  lastPage: prog.lastPage,
                  totalPages: prog.totalPages,
                  sourceId: prog.sourceId,
                  readingMode: prog.readingMode,
                });
              }}
              onExitReader={() => setActiveTab('browse')}
              onOpenSeriesPage={handleInspectSeries}
              onDownloadCurrentChapter={(series, ch, sourceId) =>
                handleQueueChapters(series, [ch], sourceId, engineConfig.defaultFormat)
              }
              readLaterQueue={readLaterQueue}
              onToggleReadLaterChapter={handleToggleReadLaterChapter}
              onOpenReadLaterTab={() => setActiveTab('read-later')}
            />
          ) : (
            <div className="bg-[#0F1523] border border-slate-800 rounded-xl p-12 text-center space-y-3">
              <div className="text-base font-semibold text-white">
                {isInitialCatalogLoading
                  ? 'Syncing live manga series from FMD2 sources...'
                  : 'Select a series from Browse Sources to begin reading'}
              </div>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Choose any title from Browse Sources to stream live upstream chapter pages.
              </p>
              <button
                type="button"
                onClick={() => setActiveTab('browse')}
                className="px-4 py-2 text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors"
              >
                Browse Live Sources
              </button>
            </div>
          ))}

        {activeTab === 'archivist' && (
          <SmartDiscoveryView
            catalog={catalog}
            onInspectSeries={(s) => handleInspectSeries(s)}
            onSearchCatalogForTitle={(title) => {
              setSearchQuery(title);
              setLibraryFilter('all');
              setActiveTab('browse');
            }}
          />
        )}

        {activeTab === 'settings' && (
          <SourcesSettingsView
            enabledSources={enabledSources}
            onToggleSource={handleToggleSourceInSettings}
            onSetEnabledSources={handleSetEnabledSources}
            engineConfig={engineConfig}
            onUpdateEngineConfig={handleUpdateEngineConfig}
            onBackToCatalog={() => setActiveTab('browse')}
            catalog={catalog}
            onOpenSeriesInReader={(series, ch) => handleReadChapter(series, ch)}
            themePrefs={themePrefs}
            onUpdateThemePrefs={handleUpdateThemePrefs}
          />
        )}
          </div>
        </React.Suspense>
      </main>

      {/* Quiet Minimal Footer */}
      <footer className={`border-t border-white/[0.06] bg-[#090A0F] py-6 px-6 text-[10px] text-white/30 ${activeTab === 'reader' ? 'hidden' : isSidebarCollapsed ? 'lg:ml-[76px] lg:w-[calc(100%-76px)]' : 'lg:ml-[248px] lg:w-[calc(100%-248px)]'}`}>
        <div className="mx-auto flex max-w-[1500px] flex-col items-center justify-between gap-4 sm:flex-row">
          <div>
            FMD2 Studio · your stories, all in one shelf
          </div>
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            <span>{enabledSources.length} live sources connected</span>
          </div>
        </div>
      </footer>

      {activeTab !== 'reader' && (
        <nav aria-label="Mobile dock" className="fixed inset-x-3 bottom-3 z-50 grid grid-cols-5 rounded-2xl border border-white/10 bg-[#101118]/95 p-1.5 shadow-[0_14px_50px_rgba(0,0,0,.65)] backdrop-blur-xl lg:hidden">
          {[
            { label: 'Browse', icon: Home, action: () => navigateToHomeSection(), active: activeNavigationTab === 'home' },
            { label: 'Catalog', icon: BookOpen, action: () => setActiveTab('catalog'), active: activeNavigationTab === 'catalog' || activeNavigationTab === 'browse' },
            { label: 'Shelf', icon: Bookmark, action: () => setActiveTab('read-later'), active: activeNavigationTab === 'read-later' },
            { label: 'Downloads', icon: Download, action: () => setActiveTab('downloads'), active: activeNavigationTab === 'downloads' },
            { label: 'Search', icon: Search, action: () => setIsCommandPaletteOpen(true), active: false },
          ].map(({ label, icon: Icon, action, active }) => (
            <button key={label} type="button" onClick={action} aria-current={active ? 'page' : undefined} className={`flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl py-2 text-[8px] font-semibold transition-colors ${active ? 'bg-violet-500/15 text-violet-100' : 'text-white/40 hover:text-white/80'}`}>
              <Icon className="h-4 w-4" /><span>{label}</span>
            </button>
          ))}
        </nav>
      )}

      {/* Series Chapter Inspector Modal */}
      {inspectedSeries && (
        <React.Suspense fallback={<ModalLoadingFallback />}>
          <MangaDetailModal
            series={inspectedSeries}
            enabledSources={enabledSources}
            engineConfig={engineConfig}
            onUpdateEngineConfig={handleUpdateEngineConfig}
            readingProgress={getSeriesReadingProgress(readingHistory, inspectedSeries)}
            onResumeReading={handleResumeSeries}
            existingTasks={downloadQueue}
            isBookmarked={bookmarkedIds.includes(inspectedSeries.id)}
            onToggleBookmark={handleToggleBookmark}
            onClose={() => setInspectedSeries(null)}
            onReadChapter={handleReadChapter}
            onQueueChapters={handleQueueChapters}
            onOpenDownloadsTab={() => setActiveTab('downloads')}
          />
        </React.Suspense>
      )}

      {/* Paste Direct Manga URL Modal (Classic FMD2 Workflow) */}
      {showUrlModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="paste-url-dialog-title"
        >
          <div className="w-full max-w-xl bg-[#0F1523] border border-slate-800 rounded-xl p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 id="paste-url-dialog-title" className="text-lg font-bold text-white font-display">
                Paste Direct Manga URL (FMD2 Link Grabber)
              </h2>
              <button
                type="button"
                onClick={() => setShowUrlModal(false)}
                aria-label="Close URL modal"
                className="p-1.5 text-slate-400 hover:text-white rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-400">
              In addition to searching by title, you can paste any direct link from a supported FMD2 Lua module (weebcentral.com, asurascans.com, mangadex.org, likemanga.ink, or mangakatana.com) to automatically detect the series and download chapters.
            </p>

            <form onSubmit={handleModalUrlSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="modal-direct-url-input"
                  className="block text-xs text-slate-300 mb-1.5"
                >
                  Manga Series or Chapter URL
                </label>
                <div className="relative">
                  <Link2 className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="modal-direct-url-input"
                    type="text"
                    value={modalUrlInput}
                    onChange={(e) => setModalUrlInput(e.target.value)}
                    placeholder="https://weebcentral.com/series/01J76XYCPSY3C4BNPBRY8JMCBE/Solo-Leveling"
                    className="w-full pl-10 pr-4 py-2.5 text-xs font-mono bg-[#0B0F17] border border-slate-800 rounded-lg text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-slate-400">Archive Format:</span>
                  {(['CBZ', 'ZIP'] as ArchiveFormat[]).map((fmt) => (
                    <button
                      key={fmt}
                      type="button"
                      onClick={() => setModalFormat(fmt)}
                      className={`px-2.5 py-1 text-xs font-mono rounded ${
                        modalFormat === fmt
                          ? 'bg-indigo-600 text-white'
                          : 'bg-[#0B0F17] text-slate-400 hover:text-white border border-slate-800'
                      }`}
                    >
                      {fmt}
                    </button>
                  ))}
                </div>
              </div>

              {modalError && (
                <div role="alert" className="text-xs text-rose-400 font-mono">
                  {modalError}
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowUrlModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg"
                >
                  Fetch & Download Link
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Power-User Keyboard Shortcuts Modal */}
      {showShortcutsModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="keyboard-shortcuts-dialog-title"
        >
          <div className="w-full max-w-2xl bg-[#0F1523] border border-slate-800 rounded-xl p-6 space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto animate-modal-panel">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2.5">
                <Keyboard className="w-5 h-5 text-indigo-400" />
                <div>
                  <h2
                    id="keyboard-shortcuts-dialog-title"
                    className="text-lg font-bold text-white font-display"
                  >
                    Power-User Keyboard Shortcuts
                  </h2>
                  <p className="text-xs text-slate-400">
                    Instantly toggle between primary navigation tabs and studio actions from anywhere
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowShortcutsModal(false)}
                aria-label="Close keyboard shortcuts modal"
                className="p-1.5 text-slate-400 hover:text-white rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="text-xs font-semibold text-white">
                Primary Navigation Tab Shortcuts
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {PRIMARY_NAV_SHORTCUTS.filter((sc) => sc.tab !== 'catalog').map((sc) => {
                  const isCurrent = activeTab === sc.tab;
                  return (
                    <button
                      key={sc.tab}
                      type="button"
                      onClick={() => {
                        setActiveTab(sc.tab);
                        setShowShortcutsModal(false);
                      }}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between gap-3 ${
                        isCurrent
                          ? 'bg-indigo-600/15 border-indigo-500'
                          : 'bg-[#0B0F17] border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div>
                        <div className="text-xs font-bold text-white">{sc.label}</div>
                        <div className="text-[11px] text-slate-400 mt-0.5">{sc.description}</div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0 font-mono text-xs">
                        <kbd className="px-2 py-1 rounded bg-[#0F1523] border border-slate-700 text-indigo-300 uppercase">
                          {sc.key}
                        </kbd>
                        <span className="text-[10px] text-slate-500">or</span>
                        <kbd className="px-2 py-1 rounded bg-[#0F1523] border border-slate-700 text-slate-300">
                          {sc.numericKey}
                        </kbd>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t border-slate-800/80">
              <div className="text-xs font-semibold text-white">Quick Workspace Shortcuts</div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 font-mono text-xs">
                <div className="p-2.5 rounded-lg bg-[#0B0F17] border border-slate-800 flex items-center justify-between">
                  <span className="text-slate-400 font-sans">Focus Search</span>
                  <kbd className="px-2 py-0.5 rounded bg-[#0F1523] border border-slate-700 text-indigo-300">
                    /
                  </kbd>
                </div>
                <div className="p-2.5 rounded-lg bg-[#0B0F17] border border-slate-800 flex items-center justify-between">
                  <span className="text-slate-400 font-sans">Shortcuts Guide</span>
                  <kbd className="px-2 py-0.5 rounded bg-[#0F1523] border border-slate-700 text-indigo-300">
                    ?
                  </kbd>
                </div>
                <div className="p-2.5 rounded-lg bg-[#0B0F17] border border-slate-800 flex items-center justify-between">
                  <span className="text-slate-400 font-sans">Close Modal</span>
                  <kbd className="px-2 py-0.5 rounded bg-[#0F1523] border border-slate-700 text-indigo-300">
                    Esc
                  </kbd>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowShortcutsModal(false)}
                className="px-5 py-2 text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cloud Reading History Sync & Cross-Device Session Continuation Modal */}
      {showCloudSyncModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cloud-sync-dialog-title"
        >
          <div className="w-full max-w-2xl bg-[#0F1523] border border-slate-800 rounded-2xl p-6 space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto animate-modal-panel">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2.5">
                <Cloud className="w-5 h-5 text-emerald-400" />
                <div>
                  <h2
                    id="cloud-sync-dialog-title"
                    className="text-lg font-bold text-white font-display"
                  >
                    Cloud Reading History Sync &amp; Cross-Device Resume
                  </h2>
                  <p className="text-xs text-slate-400">
                    Persists your manga reading sessions and bookmarks to the backend API (<code className="font-mono text-indigo-300">/api/sync/reading-history</code>) so you can seamlessly resume reading on any device.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCloudSyncModal(false)}
                aria-label="Close Cloud Sync modal"
                className="p-1.5 text-slate-400 hover:text-white rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Live Telemetry Banner */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs font-mono">
              <div className="p-3 rounded-xl bg-[#0B0F17] border border-slate-800">
                <div className="text-[10px] uppercase text-slate-400">Sync Status</div>
                <div className="text-sm font-bold text-emerald-400 mt-0.5 capitalize">
                  {cloudSyncStatus}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-[#0B0F17] border border-slate-800">
                <div className="text-[10px] uppercase text-slate-400">Synced Series</div>
                <div className="text-sm font-bold text-white mt-0.5 tabular-nums">
                  {Object.keys(readingHistory).length} Series
                </div>
              </div>
              <div className="p-3 rounded-xl bg-[#0B0F17] border border-slate-800">
                <div className="text-[10px] uppercase text-slate-400">Cloud Revision</div>
                <div className="text-sm font-bold text-indigo-400 mt-0.5 tabular-nums">
                  Rev #{cloudSyncConfig.revision}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-[#0B0F17] border border-slate-800">
                <div className="text-[10px] uppercase text-slate-400">Last Synced</div>
                <div className="text-sm font-bold text-amber-300 mt-0.5">
                  {cloudSyncConfig.lastSyncedAt
                    ? formatRelativeReadTime(cloudSyncConfig.lastSyncedAt)
                    : 'Just now'}
                </div>
              </div>
            </div>

            {cloudSyncNotice && (
              <div
                role="status"
                className="px-3.5 py-2.5 rounded-xl bg-emerald-950/60 border border-emerald-700/60 text-xs font-mono text-emerald-200 flex items-center justify-between gap-2"
              >
                <span>{cloudSyncNotice}</span>
                <button
                  type="button"
                  onClick={() => setCloudSyncNotice(null)}
                  className="text-emerald-400 hover:text-white cursor-pointer"
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* Cross-Device Profile Key & Device Name Form */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const normalizedKey = normalizeCloudSyncKey(syncKeyInput);
                const cleanDevice = deviceNameInput.trim() || 'FMD2 Web Studio';
                setSyncKeyInput(normalizedKey);
                setDeviceNameInput(cleanDevice);
                setCloudSyncConfig((prev) => ({
                  ...prev,
                  syncKey: normalizedKey,
                  deviceName: cleanDevice,
                }));
                void pullAndMergeCloudReadingHistory({
                  syncKey: normalizedKey,
                  announce: true,
                });
              }}
              className="p-4 rounded-xl bg-[#0B0F17] border border-slate-800 space-y-3"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                  <Laptop className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Cross-Device Sync Profile &amp; Device Identifier</span>
                </div>
                <label className="inline-flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={cloudSyncConfig.autoSync}
                    onChange={(e) =>
                      setCloudSyncConfig((prev) => ({
                        ...prev,
                        autoSync: e.target.checked,
                      }))
                    }
                    className="rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>Auto-Sync on Page Turn</span>
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="cloud-sync-key-input"
                    className="block text-[11px] font-mono text-slate-400 mb-1"
                  >
                    Cloud Sync Profile Key (use same key across devices)
                  </label>
                  <input
                    id="cloud-sync-key-input"
                    type="text"
                    value={syncKeyInput}
                    onChange={(e) => setSyncKeyInput(e.target.value)}
                    placeholder="fmd2-global-cloud"
                    className="w-full px-3 py-2 text-xs font-mono bg-[#0F1523] border border-slate-800 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label
                    htmlFor="cloud-device-name-input"
                    className="block text-[11px] font-mono text-slate-400 mb-1"
                  >
                    This Device Name
                  </label>
                  <input
                    id="cloud-device-name-input"
                    type="text"
                    value={deviceNameInput}
                    onChange={(e) => setDeviceNameInput(e.target.value)}
                    placeholder="Desktop Studio / iPad Reader"
                    className="w-full px-3 py-2 text-xs font-mono bg-[#0F1523] border border-slate-800 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors cursor-pointer"
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 ${
                        cloudSyncStatus === 'syncing' ? 'animate-spin' : ''
                      }`}
                    />
                    <span>Sync Now (Merge Devices)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void pushReadingHistoryToCloud(readingHistory, bookmarkedIds, {
                        syncKey: syncKeyInput,
                        deviceName: deviceNameInput,
                        mode: 'merge',
                        announce: true,
                      })
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 transition-colors cursor-pointer"
                  >
                    <UploadCloud className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Push to Cloud</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void pullAndMergeCloudReadingHistory({
                        syncKey: syncKeyInput,
                        announce: true,
                        overwriteLocal: true,
                      })
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 transition-colors cursor-pointer"
                  >
                    <DownloadCloud className="w-3.5 h-3.5 text-amber-400" />
                    <span>Pull from Cloud</span>
                  </button>
                </div>
              </div>
            </form>

            {/* Cloud-Persisted Reading Sessions Ready to Resume */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold text-white">
                  Cloud-Synced Reading Sessions ({recentlyReadEntries.length})
                </div>
                <span className="text-[11px] font-mono text-slate-400">
                  Click Resume to continue from your exact chapter &amp; page
                </span>
              </div>

              {recentlyReadEntries.length > 0 ? (
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {recentlyReadEntries.map(({ series, progress }) => {
                    const sourceMeta = ALL_FMD2_SOURCES.find(
                      (s) => s.id === progress.sourceId
                    );
                    return (
                      <div
                        key={`cloud-session-${series.id}`}
                        className="p-3 rounded-xl bg-[#0B0F17] border border-slate-800 flex flex-wrap items-center justify-between gap-3"
                      >
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-center gap-2 text-xs">
                            <span className="font-bold text-white truncate font-display">
                              {series.title}
                            </span>
                            <span className="font-mono text-amber-400 tabular-nums">
                              Ch. {progress.chapterNumber} · P. {progress.lastPage}/
                              {progress.totalPages}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-slate-400">
                            <span>{sourceMeta?.name || progress.sourceId}</span>
                            <span aria-hidden="true">·</span>
                            <span>{formatRelativeReadTime(progress.updatedAt)}</span>
                            {progress.deviceName && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="text-indigo-300">
                                  {progress.deviceName}
                                </span>
                              </>
                            )}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            setShowCloudSyncModal(false);
                            handleResumeSeries(series, progress);
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <Play className="w-3 h-3 fill-slate-950" />
                          <span>Resume Ch. {progress.chapterNumber}</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-[#0B0F17] border border-slate-800 text-xs text-slate-400 text-center">
                  No cloud reading sessions recorded yet. Open any manga chapter in the reader to automatically persist your progress to the cloud backend.
                </div>
              )}
            </div>

            <div className="flex items-center justify-end pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowCloudSyncModal(false)}
                className="px-5 py-2 text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {hasOpenedGitHubReleaseModal && (
        <React.Suspense
          fallback={showGitHubReleaseModal ? <ModalLoadingFallback /> : null}
        >
          <GitHubReleaseModal
            isOpen={showGitHubReleaseModal}
            onClose={() => setShowGitHubReleaseModal(false)}
          />
        </React.Suspense>
      )}

      <CommandPalette
        open={isCommandPaletteOpen}
        catalog={catalog}
        onClose={() => setIsCommandPaletteOpen(false)}
        onInspectSeries={handleInspectSeries}
        onSearchAuthor={(author) => {
          setSearchQuery(author);
          setLibraryFilter('all');
          setActiveTab('catalog');
        }}
      />
    </div>
  );
}
