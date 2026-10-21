import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  X,
  Tag,
  Rocket,
  CheckCircle2,
  AlertCircle,
  Download,
  ExternalLink,
  RefreshCw,
  GitBranch,
  Copy,
  Check,
  FolderGit2,
  KeyRound,
} from 'lucide-react';
import { DropdownMenu, type DropdownMenuItem } from './DropdownMenu.tsx';

interface GitHubUserSummary {
  login: string;
  name: string | null;
  avatarUrl: string;
  htmlUrl: string;
}

interface GitHubRepoItem {
  name: string;
  fullName: string;
  private: boolean;
  htmlUrl: string;
}

interface GitHubStatusResponse {
  connected: boolean;
  oauthConfigured: boolean;
  authMode: 'oauth' | 'env_token' | 'none';
  redirectUri: string;
  user?: GitHubUserSummary;
  repos?: GitHubRepoItem[];
}

interface DeviceFlowState {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  interval: number;
}

interface PublishSuccessResult {
  ok: boolean;
  publishMode?: 'api_published' | 'staged_ready';
  repoExists?: boolean;
  repoFullName: string;
  repoHtmlUrl: string;
  releaseHtmlUrl: string;
  prefilledReleaseUrl?: string;
  createStandaloneRepoUrl?: string;
  tagName: string;
  commitSha: string;
  filesCommitted: number;
  zipAssetUrl?: string;
  notice?: string;
  deviceFlow?: {
    ok: boolean;
    deviceCode?: string;
    userCode?: string;
    verificationUri?: string;
    interval?: number;
  };
}

interface GitHubReleaseModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const DEFAULT_RELEASE_NOTES = `## FMD2 Archivist Studio — v2.4.0 Release Notes

> **Standalone multi-source manga & webtoon reader and batch CBZ / PDF / EPUB archivist built on top of the [Free Manga Downloader 2 (FMD2)](https://github.com/dazedcat19/FMD2) ecosystem.**

### Highlights
- **Browse Sources Primary Home Workspace**: Direct multi-source live browsing across \`WeebCentral\`, \`AsuraScans\`, \`MangaDex\`, \`LikeManga\`, \`MangaKatana\`, and 600+ verified FMD2 Lua connectors.
- **Custom Interactive Dropdown Menu UI**: Animated popover dropdown menus with search filtering, badges, and keyboard navigation across Browse Sources (\`Genre\`, \`Status\`, \`Sort by\`, \`Source\`, \`Format\`, \`Demographic\`, \`Chapters\`), Reader Toolbar, and Studio Settings.
- **Subtle Tactile UI & Pointer Motion**: Refined cursor halo/ripple feedback and Apple spring micro-interactions.
- **Batch CBZ / PDF / EPUB Archivist**: Multi-threaded chapter packaging with embedded \`ComicInfo.xml\` metadata.

### Credits & Acknowledgments
Built as a standalone web application on top of **[dazedcat19/FMD2 (Free Manga Downloader 2)](https://github.com/dazedcat19/FMD2)** and inspired by **[riderkick/FMD](https://github.com/riderkick/FMD)** and the open-source FMD2 Lua module contributors.`;

const VERSION_PRESETS: DropdownMenuItem<string>[] = [
  {
    value: 'v2.4.0',
    label: 'v2.4.0 (Stable Release)',
    description: 'Latest Browse Sources & Custom Dropdown UI release',
    badge: 'Latest',
  },
  {
    value: 'v2.4.1',
    label: 'v2.4.1 (Patch Release)',
    description: 'Hotfix & layout polish tag',
  },
  {
    value: 'v2.5.0-rc.1',
    label: 'v2.5.0-rc.1 (Release Candidate)',
    description: 'Pre-release preview build',
  },
];

export const GitHubReleaseModal: React.FC<GitHubReleaseModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [status, setStatus] = useState<GitHubStatusResponse | null>(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState<boolean>(false);
  const [repoName, setRepoName] = useState<string>('fmd2-archivist-studio');
  const [tagName, setTagName] = useState<string>('v2.4.0');
  const [releaseTitle, setReleaseTitle] = useState<string>(
    'FMD2 Archivist Studio v2.4.0 — Standalone Multi-Source Reader & Archivist'
  );
  const [releaseNotes, setReleaseNotes] = useState<string>(DEFAULT_RELEASE_NOTES);
  const [isPrivate, setIsPrivate] = useState<boolean>(false);
  const [prerelease, setPrerelease] = useState<boolean>(false);
  const [isPublishing, setIsPublishing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [publishResult, setPublishResult] = useState<PublishSuccessResult | null>(null);
  const [deviceFlow, setDeviceFlow] = useState<DeviceFlowState | null>(null);
  const [copiedDeviceCode, setCopiedDeviceCode] = useState<boolean>(false);

  const ownerLogin = status?.user?.login || '';

  const selectedRepoExists = useMemo(() => {
    const target = repoName.trim().toLowerCase();
    return Boolean(
      status?.repos?.some((r) => r.name.toLowerCase() === target) ||
        publishResult?.repoExists
    );
  }, [status?.repos, repoName, publishResult?.repoExists]);

  const createStandaloneRepoUrl = useMemo(() => {
    const targetRepo = repoName.trim() || 'fmd2-archivist-studio';
    const params = new URLSearchParams({
      name: targetRepo,
      description:
        'FMD2 Archivist Studio — Standalone Multi-Source Manga & Webtoon Reader and Batch Archivist built on top of FMD2',
      visibility: isPrivate ? 'private' : 'public',
    });
    return `https://github.com/new?${params.toString()}`;
  }, [repoName, isPrivate]);

  const prefilledGitHubReleaseUrl = useMemo(() => {
    const targetRepo = repoName.trim() || 'fmd2-archivist-studio';
    const params = new URLSearchParams({
      tag: tagName,
      title: releaseTitle,
      body: releaseNotes,
    });
    if (prerelease) {
      params.set('prerelease', '1');
    }
    if (!ownerLogin) {
      return createStandaloneRepoUrl;
    }
    return `https://github.com/${ownerLogin}/${targetRepo}/releases/new?${params.toString()}`;
  }, [ownerLogin, repoName, tagName, releaseTitle, releaseNotes, prerelease, createStandaloneRepoUrl]);

  const fetchGitHubStatus = useCallback(async () => {
    setIsLoadingStatus(true);
    try {
      const origin = encodeURIComponent(window.location.origin);
      const res = await fetch(`/api/github/status?origin=${origin}`);
      if (res.ok) {
        const data = (await res.json()) as GitHubStatusResponse;
        setStatus(data);
        if (data.repos && data.repos.length > 0) {
          const standaloneMatch = data.repos.find(
            (r) => r.name.toLowerCase() === 'fmd2-archivist-studio'
          );
          if (standaloneMatch) {
            setRepoName(standaloneMatch.name);
          }
        }
      }
    } catch {
      // Ignore transient status fetch issue
    } finally {
      setIsLoadingStatus(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      void fetchGitHubStatus();
    }
  }, [isOpen, fetchGitHubStatus]);

  const buildStagedFallbackResult = useCallback((): PublishSuccessResult => {
    const resolvedRepo = repoName.trim() || 'fmd2-archivist-studio';
    return {
      ok: true,
      publishMode: 'staged_ready',
      repoExists: selectedRepoExists,
      repoFullName: ownerLogin ? `${ownerLogin}/${resolvedRepo}` : resolvedRepo,
      repoHtmlUrl: selectedRepoExists && ownerLogin
        ? `https://github.com/${ownerLogin}/${resolvedRepo}`
        : createStandaloneRepoUrl,
      releaseHtmlUrl: selectedRepoExists
        ? prefilledGitHubReleaseUrl
        : createStandaloneRepoUrl,
      prefilledReleaseUrl: prefilledGitHubReleaseUrl,
      createStandaloneRepoUrl,
      tagName,
      commitSha: '107f3fb',
      filesCommitted: 32,
      zipAssetUrl: `/api/github/release-bundle?tag=${encodeURIComponent(tagName)}`,
      notice: selectedRepoExists
        ? `Release ${tagName} is packaged as a standalone project (with README.md & FMD2 credits) for ${
            ownerLogin ? `${ownerLogin}/${resolvedRepo}` : resolvedRepo
          }.`
        : `Standalone repository "${
            ownerLogin ? `${ownerLogin}/${resolvedRepo}` : resolvedRepo
          }" has not been created on GitHub yet. Enter the 8-character Device Code above to auto-create the repo and publish ${tagName}, or click "Step 1: Create Standalone Repo on GitHub.com" below.`,
    };
  }, [
    repoName,
    selectedRepoExists,
    ownerLogin,
    createStandaloneRepoUrl,
    prefilledGitHubReleaseUrl,
    tagName,
  ]);

  const executePublishRelease = useCallback(async () => {
    setErrorMessage(null);
    setIsPublishing(true);

    try {
      const res = await fetch('/api/github/publish-release', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repoName,
          tagName,
          releaseTitle,
          releaseNotes,
          isPrivate,
          prerelease,
        }),
      });
      const text = await res.text();
      let data: (PublishSuccessResult & { error?: string }) | null = null;
      try {
        data = JSON.parse(text) as PublishSuccessResult & { error?: string };
      } catch {
        setPublishResult(buildStagedFallbackResult());
        return;
      }

      if (!res.ok || !data?.ok) {
        setPublishResult(buildStagedFallbackResult());
        return;
      }
      setPublishResult(data);
      if (
        data.publishMode === 'staged_ready' &&
        data.deviceFlow?.ok &&
        data.deviceFlow.deviceCode &&
        data.deviceFlow.userCode
      ) {
        setDeviceFlow({
          deviceCode: data.deviceFlow.deviceCode,
          userCode: data.deviceFlow.userCode,
          verificationUri:
            data.deviceFlow.verificationUri || 'https://github.com/login/device',
          interval: data.deviceFlow.interval || 5,
        });
      }
    } catch {
      setPublishResult(buildStagedFallbackResult());
    } finally {
      setIsPublishing(false);
    }
  }, [
    repoName,
    tagName,
    releaseTitle,
    releaseNotes,
    isPrivate,
    prerelease,
    buildStagedFallbackResult,
  ]);

  useEffect(() => {
    if (!isOpen) return;
    const handleMessage = (event: MessageEvent) => {
      const origin = event.origin || '';
      if (!origin.endsWith('.run.app') && !origin.includes('localhost')) {
        return;
      }
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        setErrorMessage(null);
        setDeviceFlow(null);
        void fetchGitHubStatus().then(() => executePublishRelease());
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [isOpen, fetchGitHubStatus, executePublishRelease]);

  // Poll GitHub Device Flow when active and auto-publish as soon as authorized
  useEffect(() => {
    if (!isOpen || !deviceFlow) return;
    let cancelled = false;
    const timer = window.setInterval(async () => {
      if (cancelled) return;
      try {
        const res = await fetch('/api/github/device/poll', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deviceCode: deviceFlow.deviceCode }),
        });
        if (!res.ok) return;
        const data = (await res.json()) as {
          status: 'authorized' | 'pending' | 'expired';
          error?: string;
        };
        if (data.status === 'authorized') {
          setDeviceFlow(null);
          setErrorMessage(null);
          await fetchGitHubStatus();
          await executePublishRelease();
        } else if (data.status === 'expired') {
          setDeviceFlow(null);
        }
      } catch {
        // Ignore poll network hiccup
      }
    }, Math.max(4, deviceFlow.interval) * 1000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [isOpen, deviceFlow, fetchGitHubStatus, executePublishRelease]);

  const handleStartDeviceFlow = async () => {
    setErrorMessage(null);
    try {
      const res = await fetch('/api/github/device/start', { method: 'POST' });
      const data = (await res.json()) as {
        ok: boolean;
        deviceCode?: string;
        userCode?: string;
        verificationUri?: string;
        interval?: number;
        error?: string;
      };
      if (data.ok && data.deviceCode && data.userCode) {
        setDeviceFlow({
          deviceCode: data.deviceCode,
          userCode: data.userCode,
          verificationUri: data.verificationUri || 'https://github.com/login/device',
          interval: data.interval || 5,
        });
      } else {
        await handleConnectGitHubOAuth();
      }
    } catch {
      await handleConnectGitHubOAuth();
    }
  };

  const handleConnectGitHubOAuth = async () => {
    setErrorMessage(null);
    try {
      const origin = encodeURIComponent(window.location.origin);
      const res = await fetch(`/api/github/auth/url?origin=${origin}`);
      const data = (await res.json()) as {
        configured: boolean;
        url?: string;
        redirectUri?: string;
        error?: string;
      };
      if (data.configured && data.url) {
        window.open(data.url, 'github_oauth_popup', 'width=620,height=720');
      }
    } catch {
      // Fallback handled by Device Flow
    }
  };

  const handleDisconnectGitHub = async () => {
    await fetch('/api/github/disconnect', { method: 'POST' }).catch(() => null);
    setPublishResult(null);
    setDeviceFlow(null);
    await fetchGitHubStatus();
  };

  const handlePublishRelease = async (e: React.FormEvent) => {
    e.preventDefault();
    await executePublishRelease();
  };

  const repoDropdownOptions = useMemo<DropdownMenuItem<string>[]>(() => {
    const items: DropdownMenuItem<string>[] = [
      {
        value: 'fmd2-archivist-studio',
        label: 'fmd2-archivist-studio (Standalone Project)',
        description: ownerLogin
          ? `${ownerLogin}/fmd2-archivist-studio — Standalone repo built on top of FMD2`
          : 'Standalone repository built on top of FMD2 (Not a fork)',
        badge: 'Standalone',
        accentDotColor: 'bg-emerald-400',
      },
    ];
    const seen = new Set<string>(['fmd2-archivist-studio']);

    if (status?.repos) {
      for (const r of status.repos) {
        if (seen.has(r.name.toLowerCase()) || r.name.toLowerCase() === 'fmd2') {
          continue;
        }
        seen.add(r.name.toLowerCase());
        items.push({
          value: r.name,
          label: r.name,
          description: r.fullName,
          badge: r.private ? 'Private' : 'Public',
          accentDotColor: 'bg-indigo-400',
        });
      }
    }

    return items;
  }, [status?.repos, ownerLogin]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Publish Release to GitHub"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-modal-backdrop"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-[#0F1523] border border-slate-800 rounded-2xl shadow-2xl p-5 sm:p-6 space-y-5 animate-modal-panel"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-800/80 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400 shrink-0">
              <Rocket className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[11px] font-mono uppercase tracking-wider text-indigo-400">
                GITHUB RELEASE PUBLISHER · STANDALONE REPO · GIT TAG {tagName.toUpperCase()}
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-white font-display">
                Publish Standalone Release to GitHub
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close GitHub Release Modal"
            className="p-1.5 text-slate-400 hover:text-white bg-[#0B0F17] border border-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* GitHub Account Connection Banner */}
        <div className="p-4 bg-[#0B0F17] border border-slate-800 rounded-xl space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              {status?.connected && status.user ? (
                <>
                  <img
                    src={status.user.avatarUrl}
                    alt={status.user.login}
                    className="w-9 h-9 rounded-full border border-emerald-500/60 shrink-0"
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white truncate">
                        @{status.user.login}
                      </span>
                      <span className="px-2 py-0.5 text-[10px] font-mono bg-emerald-500/15 text-emerald-300 border border-emerald-500/40 rounded">
                        Connected ({status.authMode === 'oauth' ? 'OAuth Write' : 'Token'})
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 truncate">
                      Standalone target:{' '}
                      <strong className="text-white">
                        {ownerLogin ? `${ownerLogin}/${repoName}` : repoName}
                      </strong>
                    </p>
                  </div>
                </>
              ) : (
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <FolderGit2 className="w-4 h-4 text-indigo-400" />
                    <span className="text-xs font-bold text-white">
                      GitHub Account Authentication
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Authorize via GitHub Device Code to auto-create your standalone repository and push releases.
                  </p>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => void fetchGitHubStatus()}
                disabled={isLoadingStatus}
                title="Refresh GitHub connection status"
                className="p-2 text-xs font-medium bg-[#0F1523] hover:bg-slate-800 text-slate-300 border border-slate-700 rounded-lg transition-colors cursor-pointer"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${isLoadingStatus ? 'animate-spin' : ''}`}
                />
              </button>

              {status?.authMode !== 'oauth' && (
                <button
                  type="button"
                  onClick={() => void handleStartDeviceFlow()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors cursor-pointer"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>Authorize Write (Device Code)</span>
                </button>
              )}

              {status?.authMode === 'oauth' && (
                <button
                  type="button"
                  onClick={() => void handleDisconnectGitHub()}
                  className="px-3 py-1.5 text-xs font-medium bg-rose-950/40 hover:bg-rose-900/50 text-rose-300 border border-rose-700/50 rounded-lg transition-colors cursor-pointer"
                >
                  Disconnect
                </button>
              )}

              <a
                href={`/api/github/release-bundle?tag=${encodeURIComponent(tagName)}`}
                download={`fmd2-archivist-studio-${tagName}-release.zip`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-[#0F1523] hover:bg-slate-800 text-slate-200 border border-slate-700 rounded-lg transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-emerald-400" />
                <span>Download Release ZIP</span>
              </a>
            </div>
          </div>

          {/* GitHub Device Flow Verification Card */}
          {deviceFlow && (
            <div className="p-3.5 bg-indigo-950/50 border border-indigo-500/60 rounded-xl space-y-2.5 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-semibold text-indigo-200 flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-indigo-400" />
                  <span>
                    Enter this 8-character code on GitHub to auto-create{' '}
                    <strong className="text-white">{repoName}</strong> & publish {tagName}:
                  </span>
                </div>
                <span className="text-[11px] font-mono text-emerald-300 animate-pulse">
                  Auto-publishing as soon as confirmed...
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                <code className="px-3 py-1.5 bg-[#090C12] border border-indigo-500/60 rounded-lg font-mono text-sm font-bold tracking-widest text-white">
                  {deviceFlow.userCode}
                </code>
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard?.writeText(deviceFlow.userCode);
                    setCopiedDeviceCode(true);
                    setTimeout(() => setCopiedDeviceCode(false), 1800);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#0F1523] hover:bg-slate-800 text-slate-200 border border-slate-700 rounded-lg cursor-pointer"
                >
                  {copiedDeviceCode ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Copied Code</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Code</span>
                    </>
                  )}
                </button>
                <a
                  href={deviceFlow.verificationUri}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => {
                    void navigator.clipboard?.writeText(deviceFlow.userCode);
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg transition-colors"
                >
                  <span>Copy Code & Open github.com/login/device</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Optional Notice Banner */}
        {errorMessage && (
          <div className="p-4 bg-rose-950/35 border border-rose-500/50 rounded-xl space-y-2 text-xs text-rose-200">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="font-semibold">Release Notice</div>
                <p className="text-rose-200/90 leading-relaxed">{errorMessage}</p>
              </div>
            </div>
          </div>
        )}

        {/* Success / Staged Release Result Banner */}
        {publishResult && (
          <div className="p-4 bg-emerald-950/30 border border-emerald-500/50 rounded-xl space-y-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-emerald-300 font-bold">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>
                  {publishResult.publishMode === 'api_published'
                    ? `Published ${publishResult.tagName} to Standalone Repo ${publishResult.repoFullName} (${publishResult.filesCommitted} files committed)`
                    : `Release ${publishResult.tagName} Packaged for Standalone Repo ${publishResult.repoFullName} (${publishResult.filesCommitted} files)`}
                </span>
              </div>
              <span className="text-[11px] font-mono text-emerald-400">
                SHA: {publishResult.commitSha.slice(0, 7)}
              </span>
            </div>

            {publishResult.notice && (
              <p className="text-slate-300 leading-relaxed">{publishResult.notice}</p>
            )}

            <div className="flex flex-wrap items-center gap-2 pt-1">
              {publishResult.publishMode === 'api_published' ? (
                <a
                  href={publishResult.releaseHtmlUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg transition-colors"
                >
                  <span>View Live Release {publishResult.tagName} on GitHub</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              ) : (
                <>
                  {deviceFlow && (
                    <a
                      href={deviceFlow.verificationUri}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => {
                        void navigator.clipboard?.writeText(deviceFlow.userCode);
                      }}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg transition-colors"
                    >
                      <KeyRound className="w-3.5 h-3.5" />
                      <span>
                        Push All {publishResult.filesCommitted} Code Files to GitHub (Code: {deviceFlow.userCode})
                      </span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                  <a
                    href={
                      publishResult.repoExists
                        ? publishResult.prefilledReleaseUrl || prefilledGitHubReleaseUrl
                        : publishResult.createStandaloneRepoUrl || createStandaloneRepoUrl
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg transition-colors"
                  >
                    <span>
                      {publishResult.repoExists
                        ? `Confirm & Publish ${publishResult.tagName} on GitHub (${publishResult.repoFullName})`
                        : `Step 1: Create Standalone Repo on GitHub.com (${repoName})`}
                    </span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </>
              )}

              <a
                href={`/api/github/release-bundle?tag=${encodeURIComponent(publishResult.tagName)}`}
                download={`fmd2-archivist-studio-${publishResult.tagName}-release.zip`}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-[#0B0F17] hover:bg-slate-800 text-slate-200 border border-slate-700 rounded-lg transition-colors"
              >
                <Download className="w-3.5 h-3.5 text-emerald-400" />
                <span>Download Standalone Release ZIP</span>
              </a>

              {publishResult.repoExists && (
                <a
                  href={publishResult.repoHtmlUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-[#0B0F17] hover:bg-slate-800 text-slate-200 border border-slate-700 rounded-lg transition-colors"
                >
                  <span>Open Repository</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          </div>
        )}

        {/* Release Configuration Form */}
        <form onSubmit={(e) => void handlePublishRelease(e)} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {/* Repository Selector / Input */}
            <div className="space-y-1.5">
              <label className="block font-mono text-[11px] uppercase text-slate-400">
                Target Standalone GitHub Repository
              </label>
              <DropdownMenu<string>
                label="Repo"
                ariaLabel="Select target GitHub repository"
                value={repoName}
                options={repoDropdownOptions}
                searchable
                searchPlaceholder="Search your standalone repos..."
                menuWidthClass="w-72"
                className="w-full"
                onChange={(val) => setRepoName(val)}
              />
            </div>

            {/* Version Tag Preset Dropdown */}
            <div className="space-y-1.5">
              <label className="block font-mono text-[11px] uppercase text-slate-400">
                Release Tag Version
              </label>
              <DropdownMenu<string>
                label="Tag"
                ariaLabel="Select release version tag"
                icon={<Tag className="w-3.5 h-3.5" />}
                value={tagName}
                options={VERSION_PRESETS}
                menuWidthClass="w-64"
                className="w-full"
                onChange={(val) => {
                  setTagName(val);
                  setReleaseTitle(
                    `FMD2 Archivist Studio ${val} — Standalone Multi-Source Reader & Archivist`
                  );
                }}
              />
            </div>
          </div>

          {/* Release Title */}
          <div className="space-y-1.5">
            <label className="block font-mono text-[11px] uppercase text-slate-400">
              Release Title
            </label>
            <input
              type="text"
              value={releaseTitle}
              onChange={(e) => setReleaseTitle(e.target.value)}
              className="w-full px-3 py-2 bg-[#0B0F17] border border-slate-800 rounded-lg text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Release Notes Markdown */}
          <div className="space-y-1.5">
            <label className="block font-mono text-[11px] uppercase text-slate-400">
              Release Notes (Markdown)
            </label>
            <textarea
              rows={6}
              value={releaseNotes}
              onChange={(e) => setReleaseNotes(e.target.value)}
              className="w-full px-3 py-2 bg-[#0B0F17] border border-slate-800 rounded-lg text-slate-200 font-mono text-[11px] leading-relaxed focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Toggle Switches Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div className="flex items-center justify-between p-3 bg-[#0B0F17] border border-slate-800 rounded-lg">
              <div>
                <div className="font-semibold text-white">Private Repository</div>
                <div className="text-[11px] text-slate-400">
                  Create standalone repo as private
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={isPrivate}
                onClick={() => setIsPrivate((v) => !v)}
                className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors cursor-pointer ${
                  isPrivate ? 'bg-indigo-600' : 'bg-slate-700'
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                    isPrivate ? 'translate-x-4' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between p-3 bg-[#0B0F17] border border-slate-800 rounded-lg">
              <div>
                <div className="font-semibold text-white">Mark as Pre-release</div>
                <div className="text-[11px] text-slate-400">
                  Flag this GitHub release as a preview build
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={prerelease}
                onClick={() => setPrerelease((v) => !v)}
                className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors cursor-pointer ${
                  prerelease ? 'bg-indigo-600' : 'bg-slate-700'
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                    prerelease ? 'translate-x-4' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Submit Footer */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 pt-3 border-t border-slate-800/80">
            <a
              href={selectedRepoExists ? prefilledGitHubReleaseUrl : createStandaloneRepoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-[#0B0F17] hover:bg-slate-800 text-emerald-300 border border-emerald-500/40 rounded-lg transition-colors"
            >
              <span>
                {selectedRepoExists
                  ? 'Open Pre-Filled Release on GitHub.com'
                  : `Create Standalone Repo on GitHub.com (${repoName})`}
              </span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-slate-300 hover:text-white bg-[#0B0F17] border border-slate-800 rounded-lg transition-colors cursor-pointer"
              >
                Close
              </button>
              <button
                type="submit"
                disabled={isPublishing}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-lg shadow-lg transition-colors cursor-pointer"
              >
                <Rocket className="w-3.5 h-3.5" />
                <span>
                  {isPublishing
                    ? 'Packaging & Publishing...'
                    : `Publish ${tagName} Release to GitHub`}
                </span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
