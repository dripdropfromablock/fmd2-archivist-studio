import React, { useState, useEffect, useMemo } from 'react';
import {
  Play,
  Pause,
  Trash2,
  FolderDown,
  Link2,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Download,
  SlidersHorizontal,
  RefreshCw,
  Activity,
} from 'lucide-react';
import {
  FMD2_SOURCE_MODULES,
  summarizeDownloadQueue,
  parseFmdDirectUrl,
  type DownloadTask,
  type ArchiveFormat,
  type FmdEngineConfig,
} from '../utils/fmdLogic.ts';
import { triggerBrowserFileDownload } from '../utils/browserDownload.ts';
import { DropdownMenu, type DropdownMenuItem } from './DropdownMenu.tsx';

interface ConnectorHealthItem {
  sourceId: string;
  name: string;
  luaModule: string;
  domain: string;
  online: boolean;
  statusCode: number;
  latencyMs: number;
  mode: string;
  message: string;
}

interface DownloadManagerViewProps {
  tasks: DownloadTask[];
  engineConfig: FmdEngineConfig;
  onUpdateEngineConfig: (partial: Partial<FmdEngineConfig>) => void;
  onToggleTaskStatus: (taskId: string) => void;
  onCompleteTaskNow: (taskId: string) => void;
  onRemoveTask: (taskId: string) => void;
  onStartAll: () => void;
  onPauseAll: () => void;
  onClearCompleted: () => void;
  onGrabDirectUrl: (
    url: string,
    format: ArchiveFormat
  ) => Promise<{ ok: boolean; message: string; addedTasks?: DownloadTask[] }>;
}

export const DownloadManagerView: React.FC<DownloadManagerViewProps> = ({
  tasks,
  engineConfig,
  onUpdateEngineConfig,
  onToggleTaskStatus,
  onCompleteTaskNow,
  onRemoveTask,
  onStartAll,
  onPauseAll,
  onClearCompleted,
  onGrabDirectUrl,
}) => {
  const [directUrl, setDirectUrl] = useState('');
  const [selectedFormat, setSelectedFormat] = useState<ArchiveFormat>(
    engineConfig.defaultFormat || 'CBZ'
  );
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'downloading' | 'queued' | 'completed'
  >('all');
  const [urlFeedback, setUrlFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [submittingUrl, setSubmittingUrl] = useState(false);
  const [downloadBanner, setDownloadBanner] = useState<string | null>(null);
  const [downloadingTaskId, setDownloadingTaskId] = useState<string | null>(null);

  // Live FMD2 Connector Health Verification State
  const [connectorStatuses, setConnectorStatuses] = useState<ConnectorHealthItem[]>([]);
  const [verifyingConnectors, setVerifyingConnectors] = useState(false);

  const stats = summarizeDownloadQueue(tasks);
  const liveParsedPreview = directUrl.trim() ? parseFmdDirectUrl(directUrl) : null;

  const archiveFormatItems = useMemo<DropdownMenuItem<ArchiveFormat>[]>(
    () => [
      { value: 'CBZ', label: 'CBZ Archive', description: 'Comic Book ZIP with ComicInfo.xml' },
      { value: 'ZIP', label: 'ZIP Archive', description: 'Standard compressed chapter images' },
    ],
    []
  );

  const concurrentTaskItems = useMemo<DropdownMenuItem<string>[]>(
    () =>
      [1, 2, 3, 4, 6].map((n) => ({
        value: String(n),
        label: `${n} active`,
        description: `Download ${n} chapter${n === 1 ? '' : 's'} simultaneously`,
      })),
    []
  );

  const threadPerTaskItems = useMemo<DropdownMenuItem<string>[]>(
    () =>
      [1, 2, 4, 8].map((n) => ({
        value: String(n),
        label: `${n} threads/ch`,
        description: `${n} parallel image fetch workers per chapter`,
      })),
    []
  );

  const statusFilterItems = useMemo<
    DropdownMenuItem<'all' | 'downloading' | 'queued' | 'completed'>[]
  >(
    () => [
      {
        value: 'all',
        label: 'All Tasks',
        badge: tasks.length,
        description: 'Show all queued, active, and completed archives',
      },
      {
        value: 'downloading',
        label: 'Active Downloading',
        badge: stats.activeCount,
        accentDotColor: 'bg-violet-400',
        description: 'Currently fetching and packing pages',
      },
      {
        value: 'queued',
        label: 'Queued',
        badge: stats.queuedCount,
        accentDotColor: 'bg-amber-400',
        description: 'Waiting for available worker slot',
      },
      {
        value: 'completed',
        label: 'Completed',
        badge: stats.completedCount,
        accentDotColor: 'bg-emerald-400',
        description: 'Packed archives ready for local save',
      },
    ],
    [tasks.length, stats.activeCount, stats.queuedCount, stats.completedCount]
  );

  const filteredTasks = tasks.filter((t) => {
    if (statusFilter === 'all') return true;
    return t.status === statusFilter;
  });

  const handleVerifyFmd2Connection = async () => {
    setVerifyingConnectors(true);
    try {
      const res = await fetch('/api/engine/verify-connectors');
      if (res.ok) {
        const data = (await res.json()) as { connectors?: ConnectorHealthItem[] };
        if (Array.isArray(data.connectors)) {
          setConnectorStatuses(data.connectors);
        }
      }
    } catch {
      // Ignore network error
    } finally {
      setVerifyingConnectors(false);
    }
  };

  useEffect(() => {
    void handleVerifyFmd2Connection();
  }, []);

  const handleDownloadTaskFile = async (task: DownloadTask) => {
    setDownloadingTaskId(task.id);
    try {
      if (task.status !== 'completed') {
        onCompleteTaskNow(task.id);
      }
      const result = await triggerBrowserFileDownload(task);
      if (result.ok) {
        setDownloadBanner(
          `Downloaded "${result.fileName}" (${(result.bytes / 1024).toFixed(
            1
          )} KB) via ${task.luaModule}`
        );
      } else {
        setDownloadBanner(`Download error: ${result.error || 'Could not fetch archive'}`);
      }
    } finally {
      setDownloadingTaskId(null);
    }
  };

  const handleUrlSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingUrl(true);
    try {
      const res = await onGrabDirectUrl(directUrl, selectedFormat);
      setUrlFeedback({ ok: res.ok, text: res.message });
      if (res.ok) {
        setDirectUrl('');
        // Automatically download the first resolved chapter archive to the user's browser
        if (Array.isArray(res.addedTasks) && res.addedTasks.length > 0) {
          await handleDownloadTaskFile(res.addedTasks[0]);
        }
      }
    } finally {
      setSubmittingUrl(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Global Download Confirmation Banner */}
      {downloadBanner && (
        <div
          role="status"
          className="bg-emerald-950/70 border border-emerald-700/70 text-emerald-200 px-4 py-3 rounded-xl flex items-center justify-between gap-4 text-xs font-mono"
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{downloadBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setDownloadBanner(null)}
            className="text-emerald-400 hover:text-white px-2 py-0.5 rounded"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Classic FMD2 Direct URL Link Grabber Section */}
      <section className="studio-panel bg-[#11121A] border border-white/[0.07] rounded-xl p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-lg font-bold text-white font-display">
                FMD2 Direct Link Grabber &amp; Live Engine Bridge
              </h2>
              <span aria-hidden="true" className="text-slate-600">·</span>
              <span className="text-[11px] font-mono text-emerald-400">
                ENGINE READY
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Connected to the server-side FMD2 downloader. Paste a supported manga URL to resolve chapters and package CBZ or ZIP archives.
            </p>
          </div>
          <DropdownMenu<ArchiveFormat>
            id="direct-url-format-select"
            label="Archive Format"
            ariaLabel="Archive Format"
            value={selectedFormat}
            options={archiveFormatItems}
            align="right"
            menuWidthClass="w-64"
            onChange={(fmt) => {
              setSelectedFormat(fmt);
              onUpdateEngineConfig({ defaultFormat: fmt });
            }}
          />
        </div>

        <form onSubmit={handleUrlSubmit} className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Link2 className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              aria-label="Paste direct manga URL"
              value={directUrl}
              onChange={(e) => setDirectUrl(e.target.value)}
              placeholder="https://weebcentral.com/series/01J76XYCPSY3C4BNPBRY8JMCBE/Solo-Leveling"
              className="w-full pl-10 pr-4 py-2.5 text-sm font-mono studio-subpanel bg-[#090A0F] border border-white/[0.07] rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-violet-500"
            />
          </div>
          <button
            type="submit"
            disabled={submittingUrl}
            className="flex items-center justify-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{submittingUrl ? 'Packing & Saving...' : 'Fetch & Download Link'}</span>
          </button>
        </form>

        {/* Quick Preset Links for 1-Click Testing */}
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
          <span>Sample URLs:</span>
          <button
            type="button"
            onClick={() =>
              setDirectUrl('https://weebcentral.com/series/01J76XYCPSY3C4BNPBRY8JMCBE/Solo-Leveling')
            }
            className="text-violet-400 hover:underline font-mono whitespace-nowrap shrink-0 cursor-pointer"
          >
            weebcentral.com/series/Solo-Leveling
          </button>
          <span aria-hidden="true">·</span>
          <button
            type="button"
            onClick={() =>
              setDirectUrl('https://asurascans.com/comics/shadow-slave-1bb35e56')
            }
            className="text-violet-400 hover:underline font-mono whitespace-nowrap shrink-0 cursor-pointer"
          >
            asurascans.com/comics/shadow-slave
          </button>
          <span aria-hidden="true">·</span>
          <button
            type="button"
            onClick={() =>
              setDirectUrl('https://weebcentral.com/series/01J76XY7EF75DJNQCV04HTPDZK/Berserk')
            }
            className="text-violet-400 hover:underline font-mono whitespace-nowrap shrink-0 cursor-pointer"
          >
            weebcentral.com/series/Berserk
          </button>
          <span aria-hidden="true">·</span>
          <button
            type="button"
            onClick={() => setDirectUrl('https://mangakatana.com/manga/kanojo-no-carrera.3551')}
            className="text-violet-400 hover:underline font-mono whitespace-nowrap shrink-0 cursor-pointer"
          >
            mangakatana.com/manga/kanojo-no-carrera
          </button>
        </div>

        {liveParsedPreview && (
          <div className="text-xs font-mono text-slate-300 studio-subpanel bg-[#090A0F] border border-white/[0.07] rounded-lg px-3.5 py-2 flex flex-wrap items-center gap-2">
            {liveParsedPreview.isValid ? (
              <>
                <span className="text-emerald-400">Detected Connector:</span>
                <span>{liveParsedPreview.luaModule}</span>
                <span aria-hidden="true">·</span>
                <span>Target Query: &ldquo;{liveParsedPreview.extractedQuery}&rdquo;</span>
              </>
            ) : (
              <span className="text-amber-400">{liveParsedPreview.error}</span>
            )}
          </div>
        )}

        {urlFeedback && (
          <div
            role="status"
            className={`text-xs font-mono px-3.5 py-2 rounded-lg border ${
              urlFeedback.ok
                ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
                : 'bg-rose-950/40 border-rose-800/60 text-rose-300'
            }`}
          >
            {urlFeedback.text}
          </div>
        )}
      </section>

      {/* FMD2 Connector Health & Server Worker Configuration Bar */}
      <section className="studio-panel bg-[#11121A] border border-white/[0.07] rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <SlidersHorizontal className="w-4 h-4 text-violet-400" />
            <div>
              <h3 className="text-sm font-bold text-white font-display">
                FMD2 Lua Connector Bridge &amp; Worker Pool
              </h3>
              <p className="text-xs text-slate-400 font-mono">
                Target Directory: {engineConfig.saveDirectory}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs">
            <button
              type="button"
              onClick={handleVerifyFmd2Connection}
              disabled={verifyingConnectors}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#090A0F] hover:bg-slate-800 text-emerald-400 border border-white/[0.07] rounded-lg font-mono transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${verifyingConnectors ? 'animate-spin' : ''}`}
              />
              <span>
                {verifyingConnectors ? 'Verifying FMD2...' : 'Test FMD2 Connection'}
              </span>
            </button>

            <DropdownMenu<string>
              id="engine-concurrent-select"
              label="Parallel Chapters"
              ariaLabel="Parallel Chapters"
              value={String(engineConfig.maxConcurrentTasks)}
              options={concurrentTaskItems}
              menuWidthClass="w-60"
              onChange={(val) =>
                onUpdateEngineConfig({ maxConcurrentTasks: Number(val) })
              }
            />

            <DropdownMenu<string>
              id="engine-threads-select"
              label="Page Threads"
              ariaLabel="Page Threads"
              value={String(engineConfig.maxThreadsPerTask)}
              options={threadPerTaskItems}
              align="right"
              menuWidthClass="w-60"
              onChange={(val) =>
                onUpdateEngineConfig({ maxThreadsPerTask: Number(val) })
              }
            />

            <button
              type="button"
              role="switch"
              aria-checked={engineConfig.includeComicInfoXml}
              onClick={() =>
                onUpdateEngineConfig({
                  includeComicInfoXml: !engineConfig.includeComicInfoXml,
                })
              }
              className="inline-flex items-center gap-2 text-slate-300 hover:text-white cursor-pointer select-none"
            >
              <span>Embed ComicInfo.xml</span>
              <span
                className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                  engineConfig.includeComicInfoXml ? 'bg-violet-600' : 'bg-slate-700'
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                    engineConfig.includeComicInfoXml ? 'translate-x-4' : 'translate-x-1'
                  }`}
                />
              </span>
            </button>
          </div>
        </div>

        {/* Live Connector Status Strip */}
        {connectorStatuses.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-white/[0.06]">
            {connectorStatuses.slice(0, 4).map((conn) => (
              <div
                key={conn.sourceId}
                className="studio-subpanel bg-[#090A0F] border border-white/[0.07]/90 rounded-lg px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs"
              >
                <div className="min-w-0">
                  <div className="font-semibold text-white truncate flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>{conn.name}</span>
                  </div>
                  <div className="text-[11px] font-mono text-slate-400 truncate">
                    {conn.luaModule}
                  </div>
                </div>
                <div className="text-right font-mono shrink-0">
                  <div className="text-emerald-400 text-[11px]">ONLINE</div>
                  <div className="text-slate-400 text-[11px] tabular-nums">
                    {conn.latencyMs}ms
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Queue Metrics Strip & Controls */}
      <section className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="studio-panel bg-[#11121A] border border-white/[0.07] rounded-xl p-4">
            <div className="text-xs text-slate-400">Active Engine Workers</div>
            <div className="text-2xl font-bold text-white font-mono tabular-nums mt-1">
              {stats.activeCount}{' '}
              <span className="text-xs font-normal text-slate-400">
                / {stats.totalTasks} tasks
              </span>
            </div>
          </div>
          <div className="studio-panel bg-[#11121A] border border-white/[0.07] rounded-xl p-4">
            <div className="text-xs text-slate-400">Aggregate Throughput</div>
            <div className="text-2xl font-bold text-violet-400 font-mono tabular-nums mt-1">
              {stats.totalSpeedMbps.toFixed(2)}{' '}
              <span className="text-xs font-normal text-slate-400">MB/s</span>
            </div>
          </div>
          <div className="studio-panel bg-[#11121A] border border-white/[0.07] rounded-xl p-4">
            <div className="text-xs text-slate-400">Packed Archives Ready</div>
            <div className="text-2xl font-bold text-emerald-400 font-mono tabular-nums mt-1">
              {stats.completedCount}
            </div>
          </div>
          <div className="studio-panel bg-[#11121A] border border-white/[0.07] rounded-xl p-4">
            <div className="text-xs text-slate-400">Batch Completion</div>
            <div className="text-2xl font-bold text-white font-mono tabular-nums mt-1">
              {stats.overallProgressPercent}%
            </div>
          </div>
        </div>

        {/* Queue Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <DropdownMenu<'all' | 'downloading' | 'queued' | 'completed'>
            id="download-queue-status-filter"
            label="Queue Filter"
            ariaLabel="Queue Filter"
            value={statusFilter}
            options={statusFilterItems}
            menuWidthClass="w-64"
            onChange={(val) => setStatusFilter(val)}
          />

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onStartAll}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Start All</span>
            </button>
            <button
              type="button"
              onClick={onPauseAll}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg border border-white/[0.1] transition-colors whitespace-nowrap shrink-0"
            >
              <Pause className="w-3.5 h-3.5" />
              <span>Pause All</span>
            </button>
            <button
              type="button"
              onClick={onClearCompleted}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-[#11121A] hover:bg-slate-900 text-slate-300 text-xs font-medium rounded-lg border border-white/[0.07] transition-colors whitespace-nowrap shrink-0"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear Completed</span>
            </button>
          </div>
        </div>

        {/* High-Density FMD2 Download Queue Table */}
        <div className="bg-[#11121A] border border-white/[0.07] rounded-xl overflow-hidden">
          {filteredTasks.length === 0 ? (
            <div className="p-12 text-center space-y-2">
              <FolderDown className="w-8 h-8 text-slate-500 mx-auto" />
              <div className="text-sm font-semibold text-slate-200">
                No download tasks in this view
              </div>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Paste a manga URL above or select a series from the catalog to download chapters as CBZ or ZIP archives.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/[0.07] text-[11px] font-mono text-slate-400 bg-[#090A0F]">
                    <th className="py-3 px-4">MANGA & CHAPTER</th>
                    <th className="py-3 px-4 hidden md:table-cell">ENGINE WORKER LOG</th>
                    <th className="py-3 px-4">STATUS</th>
                    <th className="py-3 px-4 w-48">PROGRESS</th>
                    <th className="py-3 px-4 hidden sm:table-cell text-right">
                      SPEED / ARCHIVE
                    </th>
                    <th className="py-3 px-4 text-right">CONTROLS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70 text-xs">
                  {filteredTasks.map((task) => {
                    const sourceInfo = FMD2_SOURCE_MODULES.find(
                      (m) => m.id === task.sourceId
                    );
                    const isSaving = downloadingTaskId === task.id;
                    return (
                      <tr
                        key={task.id}
                        className="hover:bg-slate-900/50 transition-colors"
                      >
                        <td className="py-3 px-4">
                          <div className="font-semibold text-white">{task.mangaTitle}</div>
                          <div className="text-slate-400 font-mono text-[11px] tabular-nums">
                            Ch. {String(task.chapterNumber).padStart(3, '0')} ·{' '}
                            {task.chapterTitle} · {task.format}
                          </div>
                        </td>
                        <td className="py-3 px-4 hidden md:table-cell font-mono text-[11px] text-slate-400">
                          <div className="text-slate-300">
                            {sourceInfo?.name || task.sourceId}
                          </div>
                          <div className="text-slate-500 truncate max-w-xs">
                            {task.lastLog || task.luaModule}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          {task.status === 'completed' && (
                            <span className="inline-flex items-center gap-1.5 text-emerald-400 font-medium">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Packed</span>
                            </span>
                          )}
                          {task.status === 'downloading' && (
                            <span className="inline-flex items-center gap-1.5 text-violet-400 font-medium">
                              <Download className="w-3.5 h-3.5" />
                              <span>Downloading</span>
                            </span>
                          )}
                          {task.status === 'queued' && (
                            <span className="inline-flex items-center gap-1.5 text-amber-400 font-medium">
                              <Clock className="w-3.5 h-3.5" />
                              <span>Queued</span>
                            </span>
                          )}
                          {task.status === 'paused' && (
                            <span className="inline-flex items-center gap-1.5 text-slate-400 font-medium">
                              <AlertTriangle className="w-3.5 h-3.5" />
                              <span>Paused</span>
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <div className="space-y-1">
                            <div className="flex justify-between font-mono text-[11px] tabular-nums">
                              <span className="text-slate-300">{task.progress}%</span>
                              <span className="text-slate-400">
                                {task.pagesDownloaded}/{task.totalPages}p
                              </span>
                            </div>
                            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                              <div
                                className={`h-full transition-all duration-200 ${
                                  task.status === 'completed'
                                    ? 'bg-emerald-500'
                                    : task.status === 'paused'
                                    ? 'bg-slate-500'
                                    : 'bg-violet-500'
                                }`}
                                style={{ width: `${task.progress}%` }}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4 hidden sm:table-cell text-right font-mono tabular-nums text-slate-300">
                          <div>
                            {task.status === 'downloading'
                              ? `${(task.speedKbps / 1024).toFixed(2)} MB/s`
                              : task.bytesWritten
                              ? `${(task.bytesWritten / 1024).toFixed(1)} KB`
                              : '—'}
                          </div>
                          <div className="text-slate-500 text-[11px]">
                            {task.sizeMb.toFixed(1)} MB est
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {task.status !== 'completed' && (
                              <button
                                type="button"
                                onClick={() => onToggleTaskStatus(task.id)}
                                aria-label={
                                  task.status === 'downloading'
                                    ? `Pause ${task.mangaTitle} Chapter ${task.chapterNumber}`
                                    : `Start ${task.mangaTitle} Chapter ${task.chapterNumber}`
                                }
                                className="px-2.5 py-1 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded transition-colors whitespace-nowrap shrink-0"
                              >
                                {task.status === 'downloading' ? 'Pause' : 'Start'}
                              </button>
                            )}

                            {/* Direct 1-Click Browser File Download Button (works whether Queued, Downloading, or Completed) */}
                            <button
                              type="button"
                              disabled={isSaving}
                              onClick={() => handleDownloadTaskFile(task)}
                              aria-label={`Download ${task.mangaTitle} Chapter ${task.chapterNumber} as ${task.format}`}
                              className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-emerald-600/20 hover:bg-emerald-600/35 text-emerald-300 border border-emerald-500/40 rounded transition-colors whitespace-nowrap shrink-0"
                            >
                              <Download className="w-3 h-3" />
                              <span>
                                {isSaving ? 'Saving...' : `Download ${task.format}`}
                              </span>
                            </button>

                            <button
                              type="button"
                              onClick={() => onRemoveTask(task.id)}
                              aria-label={`Remove ${task.mangaTitle} Chapter ${task.chapterNumber}`}
                              className="p-1.5 text-slate-400 hover:text-rose-400 rounded hover:bg-slate-800 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
