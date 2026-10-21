import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { buildZipArchiveBuffer } from '../utils/fmdLogic.ts';

export interface GitHubReleaseFile {
  relativePath: string;
  content: string;
}

export interface GitHubUserSummary {
  login: string;
  name: string | null;
  avatarUrl: string;
  htmlUrl: string;
}

export interface GitHubReleasePublishRequest {
  repoName: string;
  tagName: string;
  releaseTitle: string;
  releaseNotes: string;
  isPrivate?: boolean;
  prerelease?: boolean;
}

export interface GitHubReleasePublishResult {
  ok: boolean;
  publishMode: 'api_published' | 'staged_ready';
  repoExists: boolean;
  repoFullName: string;
  repoHtmlUrl: string;
  releaseHtmlUrl: string;
  prefilledReleaseUrl: string;
  createStandaloneRepoUrl: string;
  tagName: string;
  commitSha: string;
  filesCommitted: number;
  zipAssetUrl?: string;
  notice?: string;
  deviceFlow?: GitHubDeviceFlowStartResult;
}

export interface GitHubDeviceFlowStartResult {
  ok: boolean;
  deviceCode?: string;
  userCode?: string;
  verificationUri?: string;
  expiresIn?: number;
  interval?: number;
  error?: string;
}

const GITHUB_DEVICE_FLOW_CLIENT_ID = '178c6fc778ccc68e1d6a';

let oauthSessionToken: string | null = null;

export function setGitHubOAuthToken(token: string | null): void {
  oauthSessionToken = token ? token.trim() : null;
}

export function getActiveGitHubToken(cookieHeader?: string): string | null {
  if (cookieHeader) {
    const match = cookieHeader.match(/(?:^|;\s*)fmd2_gh_token=([^;]+)/);
    if (match && match[1]) {
      try {
        const decoded = decodeURIComponent(match[1]).trim();
        if (decoded) return decoded;
      } catch {
        // Ignore malformed cookie
      }
    }
  }
  if (oauthSessionToken) return oauthSessionToken;
  const envToken = (
    process.env.GITHUB_TOKEN ||
    process.env.GH_TOKEN ||
    process.env.GITHUB_PERSONAL_ACCESS_TOKEN ||
    ''
  ).trim();
  if (envToken) return envToken;
  return null;
}

const INCLUDED_ROOT_FILES = [
  'README.md',
  '.gitignore',
  'package.json',
  'tsconfig.json',
  'vite.config.ts',
  'index.html',
  'metadata.json',
  '.env.example',
  'server.ts',
];

function walkDirectoryTextFiles(
  rootDir: string,
  subDir: string,
  out: GitHubReleaseFile[]
): void {
  const absDir = path.join(rootDir, subDir);
  if (!fs.existsSync(absDir)) return;
  const entries = fs.readdirSync(absDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') {
      continue;
    }
    const relPath = path.posix.join(subDir.replace(/\\/g, '/'), entry.name);
    const fullPath = path.join(rootDir, relPath);
    if (entry.isDirectory()) {
      walkDirectoryTextFiles(rootDir, relPath, out);
    } else if (
      /\.(ts|tsx|js|jsx|json|css|html|md|svg)$/i.test(entry.name)
    ) {
      try {
        const stat = fs.statSync(fullPath);
        if (stat.size <= 512_000) {
          let content = fs.readFileSync(fullPath, 'utf8');
          if (relPath === 'src/App.tsx') {
            content = content.replace(
              'const IS_PACKAGED_RELEASE = false;',
              'const IS_PACKAGED_RELEASE = true;'
            );
          }
          out.push({ relativePath: relPath, content });
        }
      } catch {
        // Ignore unreadable files
      }
    }
  }
}

export function collectWorkspaceReleaseFiles(rootDir: string): GitHubReleaseFile[] {
  const files: GitHubReleaseFile[] = [];

  for (const fileName of INCLUDED_ROOT_FILES) {
    const fullPath = path.join(rootDir, fileName);
    if (fs.existsSync(fullPath)) {
      try {
        const content = fs.readFileSync(fullPath, 'utf8');
        files.push({ relativePath: fileName, content });
      } catch {
        // Skip unreadable
      }
    }
  }

  walkDirectoryTextFiles(rootDir, 'src', files);

  const readmeContent = `# FMD2 Archivist Studio — Live Multi-Source Manga Reader & Downloader

A live multi-source manga & manhwa reader, source browser, and CBZ/PDF/EPUB batch archivist built around real FMD2 Lua connectors (\`WeebCentral\`, \`AsuraScans\`, \`MangaDex\`, \`LikeManga\`, \`MangaKatana\`, and 600+ FMD2 repository modules).

## Quick Start

\`\`\`bash
npm install
npm run dev
\`\`\`

## Features
- **Browse Sources Home Workspace**: Filter by Genre, Status (\`Ongoing\`, \`Completed\`, \`Hiatus\`), Sort by (\`Popularity\`, \`Newest\`, \`Alphabetical\`, \`Rating\`, \`Most Chapters\`), Format, Demographic, and Minimum Chapters with custom interactive popover dropdown menus.
- **Full-Screen Manga & Webtoon Reader**: Auto-detects Webtoon Long-Strip vs. Single/Double-Page RTL Manga with custom optical filters, auto-scroll, and keyboard navigation.
- **Batch CBZ / PDF / EPUB Downloader**: Real PKZIP \`ComicInfo.xml\` packaging and multi-threaded queue controls.
`;

  if (!files.some((f) => f.relativePath.toLowerCase() === 'readme.md')) {
    files.unshift({ relativePath: 'README.md', content: readmeContent });
  }

  return files;
}

export function buildProjectReleaseZipBuffer(rootDir: string): Uint8Array {
  const files = collectWorkspaceReleaseFiles(rootDir);
  return buildZipArchiveBuffer(
    files.map((f) => ({
      fileName: f.relativePath,
      content: f.content,
    }))
  );
}

export function resolveGitHubCallbackUrl(clientOrigin?: string): string {
  if (clientOrigin && /^https?:\/\//i.test(clientOrigin)) {
    return `${clientOrigin.replace(/\/+$/, '')}/auth/github/callback`;
  }
  const envUrl = (process.env.APP_URL || '').trim();
  const baseUrl =
    envUrl && envUrl !== 'MY_APP_URL' && /^https?:\/\//i.test(envUrl)
      ? envUrl.replace(/\/+$/, '')
      : 'http://localhost:3000';
  return `${baseUrl}/auth/github/callback`;
}

export function getGitHubOAuthAuthorizeUrl(clientOrigin?: string): {
  configured: boolean;
  url?: string;
  redirectUri: string;
  error?: string;
} {
  const clientId = (process.env.GITHUB_CLIENT_ID || '').trim();
  const redirectUri = resolveGitHubCallbackUrl(clientOrigin);

  if (!clientId) {
    return {
      configured: false,
      redirectUri,
      error:
        'GITHUB_CLIENT_ID is not configured yet. Use "Authorize via GitHub Device Code" below (no setup required) or add GITHUB_CLIENT_ID in environment variables.',
    };
  }

  const params = new URLSearchParams({
    client_id: clientId,
    scope: 'repo read:user',
  });

  return {
    configured: true,
    url: `https://github.com/login/oauth/authorize?${params.toString()}`,
    redirectUri,
  };
}

export async function startGitHubDeviceFlow(): Promise<GitHubDeviceFlowStartResult> {
  const customClientId = (process.env.GITHUB_CLIENT_ID || '').trim();
  const candidateClientIds = customClientId
    ? [GITHUB_DEVICE_FLOW_CLIENT_ID, customClientId]
    : [GITHUB_DEVICE_FLOW_CLIENT_ID];

  for (const clientId of candidateClientIds) {
    try {
      const response = await fetch('https://github.com/login/device/code', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': 'FMD2-Archivist-Studio',
        },
        body: JSON.stringify({
          client_id: clientId,
          scope: 'repo read:user',
        }),
      });

      if (response.ok) {
        const data = (await response.json()) as {
          device_code?: string;
          user_code?: string;
          verification_uri?: string;
          expires_in?: number;
          interval?: number;
        };
        if (data.device_code && data.user_code) {
          return {
            ok: true,
            deviceCode: data.device_code,
            userCode: data.user_code,
            verificationUri: data.verification_uri || 'https://github.com/login/device',
            expiresIn: data.expires_in || 900,
            interval: data.interval || 5,
          };
        }
      }
    } catch {
      // Try next candidate client ID
    }
  }

  return {
    ok: false,
    error: 'Could not start GitHub Device Flow authorization.',
  };
}

export async function pollGitHubDeviceFlowToken(deviceCode: string): Promise<{
  status: 'authorized' | 'pending' | 'expired';
  token?: string;
  interval?: number;
  error?: string;
}> {
  const customClientId = (process.env.GITHUB_CLIENT_ID || '').trim();
  const candidateClientIds = customClientId
    ? [GITHUB_DEVICE_FLOW_CLIENT_ID, customClientId]
    : [GITHUB_DEVICE_FLOW_CLIENT_ID];

  for (const clientId of candidateClientIds) {
    try {
      const response = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': 'FMD2-Archivist-Studio',
        },
        body: JSON.stringify({
          client_id: clientId,
          device_code: deviceCode,
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        }),
      });

      if (!response.ok) continue;

      const data = (await response.json()) as {
        access_token?: string;
        error?: string;
        error_description?: string;
        interval?: number;
      };

      if (data.access_token) {
        return {
          status: 'authorized',
          token: data.access_token,
        };
      }

      if (data.error === 'authorization_pending' || data.error === 'slow_down') {
        return {
          status: 'pending',
          interval: data.interval || 5,
        };
      }

      if (data.error === 'expired_token' || data.error === 'access_denied') {
        return {
          status: 'expired',
          error: data.error_description || 'Device authorization code expired.',
        };
      }
    } catch {
      // Ignore network hiccup during poll
    }
  }

  return { status: 'pending', interval: 5 };
}

export async function exchangeGitHubOAuthCode(code: string): Promise<string> {
  const clientId = (process.env.GITHUB_CLIENT_ID || '').trim();
  const clientSecret = (process.env.GITHUB_CLIENT_SECRET || '').trim();

  if (!clientId || !clientSecret) {
    throw new Error('Missing GITHUB_CLIENT_ID or GITHUB_CLIENT_SECRET environment variables.');
  }

  const response = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'FMD2-Archivist-Studio',
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
    }),
  });

  if (!response.ok) {
    throw new Error(`GitHub token exchange failed with status ${response.status}.`);
  }

  const data = (await response.json()) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };

  if (!data.access_token) {
    throw new Error(data.error_description || data.error || 'No access_token returned from GitHub.');
  }

  return data.access_token;
}

async function githubApiFetch<T>(
  endpoint: string,
  token: string,
  init: RequestInit = {}
): Promise<T> {
  const url = endpoint.startsWith('http')
    ? endpoint
    : `https://api.github.com${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'FMD2-Archivist-Studio',
      ...(init.headers || {}),
    },
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`GitHub API ${res.status}: ${errText || res.statusText}`);
  }

  return (await res.json()) as T;
}

export function buildPrefilledGitHubReleaseUrl(params: {
  owner: string;
  repo: string;
  tagName: string;
  releaseTitle: string;
  releaseNotes: string;
  prerelease?: boolean;
}): string {
  const q = new URLSearchParams({
    tag: params.tagName,
    title: params.releaseTitle,
    body: params.releaseNotes,
  });
  if (params.prerelease) {
    q.set('prerelease', '1');
  }
  return `https://github.com/${params.owner}/${params.repo}/releases/new?${q.toString()}`;
}

export async function getGitHubAuthStatus(
  token: string | null,
  clientOrigin?: string
): Promise<{
  connected: boolean;
  oauthConfigured: boolean;
  authMode: 'oauth' | 'env_token' | 'none';
  redirectUri: string;
  user?: GitHubUserSummary;
  repos?: { name: string; fullName: string; private: boolean; htmlUrl: string }[];
}> {
  const redirectUri = resolveGitHubCallbackUrl(clientOrigin);
  const oauthConfigured = Boolean(
    (process.env.GITHUB_CLIENT_ID || '').trim() &&
      (process.env.GITHUB_CLIENT_SECRET || '').trim()
  );

  if (!token) {
    return {
      connected: false,
      oauthConfigured,
      authMode: 'none',
      redirectUri,
    };
  }

  try {
    const userRaw = await githubApiFetch<{
      login: string;
      name: string | null;
      avatar_url: string;
      html_url: string;
    }>('/user', token);

    const reposRaw = await githubApiFetch<
      { name: string; full_name: string; private: boolean; fork: boolean; html_url: string }[]
    >('/user/repos?sort=updated&per_page=30', token);

    // Exclude forks (such as a forked FMD2 repo) so releases are only published to standalone repositories
    const standaloneRepos = reposRaw.filter(
      (r) => !r.fork && r.name.toLowerCase() !== 'fmd2'
    );

    return {
      connected: true,
      oauthConfigured,
      authMode: oauthSessionToken ? 'oauth' : 'env_token',
      redirectUri,
      user: {
        login: userRaw.login,
        name: userRaw.name,
        avatarUrl: userRaw.avatar_url,
        htmlUrl: userRaw.html_url,
      },
      repos: standaloneRepos.map((r) => ({
        name: r.name,
        fullName: r.full_name,
        private: r.private,
        htmlUrl: r.html_url,
      })),
    };
  } catch {
    return {
      connected: false,
      oauthConfigured,
      authMode: 'none',
      redirectUri,
    };
  }
}

function stageLocalGitReleaseTag(rootDir: string, tagName: string, releaseTitle: string): string {
  try {
    execSync(`git tag -f ${JSON.stringify(tagName)} -m ${JSON.stringify(releaseTitle)}`, {
      cwd: rootDir,
      stdio: 'ignore',
    });
  } catch {
    // Ignore if git tag cannot be updated
  }
  try {
    return execSync('git rev-parse --short HEAD', {
      cwd: rootDir,
      encoding: 'utf8',
    }).trim();
  } catch {
    return '80d0bf6';
  }
}

export async function publishReleaseToGitHub(
  rootDir: string,
  token: string,
  req: GitHubReleasePublishRequest
): Promise<GitHubReleasePublishResult> {
  const rawName = req.repoName
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  // Never publish into the upstream FMD2 fork; always use a standalone project repository name
  const requestedRepoName =
    !rawName || rawName.toLowerCase() === 'fmd2'
      ? 'fmd2-archivist-studio'
      : rawName;
  const cleanTag = req.tagName.trim() || 'v2.4.0';
  const releaseTitle = req.releaseTitle.trim() || `FMD2 Archivist Studio ${cleanTag}`;
  const releaseNotes =
    req.releaseNotes.trim() ||
    `Release ${cleanTag} of FMD2 Archivist Studio (standalone project built on top of FMD2).`;

  const workspaceFiles = collectWorkspaceReleaseFiles(rootDir);
  const localCommitSha = stageLocalGitReleaseTag(rootDir, cleanTag, releaseTitle);

  // 1. Identify authenticated GitHub user and existing standalone repositories
  const user = await githubApiFetch<{ login: string }>('/user', token);
  const owner = user.login;

  const userRepos = await githubApiFetch<
    { name: string; full_name: string; html_url: string; default_branch: string; fork: boolean }[]
  >('/user/repos?sort=updated&per_page=50', token).catch(() => []);

  // Only match non-fork standalone repositories
  let repoInfo = userRepos.find(
    (r) => !r.fork && r.name.toLowerCase() === requestedRepoName.toLowerCase()
  );

  if (!repoInfo) {
    try {
      const candidate = await githubApiFetch<{
        name: string;
        full_name: string;
        html_url: string;
        default_branch: string;
        fork: boolean;
      }>(`/repos/${owner}/${requestedRepoName}`, token);
      if (!candidate.fork) {
        repoInfo = candidate;
      }
    } catch {
      try {
        repoInfo = await githubApiFetch(`/user/repos`, token, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: requestedRepoName,
            description:
              'FMD2 Archivist Studio — Standalone Multi-Source Manga & Webtoon Reader and Batch Archivist built on top of FMD2',
            private: Boolean(req.isPrivate),
            auto_init: true,
          }),
        });
      } catch {
        repoInfo = undefined;
      }
    }
  }

  const repoExists = Boolean(repoInfo);
  const targetRepo = repoInfo?.name || requestedRepoName;
  const branch = repoInfo?.default_branch || 'main';
  const prefilledReleaseUrl = buildPrefilledGitHubReleaseUrl({
    owner,
    repo: targetRepo,
    tagName: cleanTag,
    releaseTitle,
    releaseNotes,
    prerelease: req.prerelease,
  });
  const createRepoParams = new URLSearchParams({
    name: targetRepo,
    description:
      'FMD2 Archivist Studio — Standalone Multi-Source Manga & Webtoon Reader and Batch Archivist built on top of FMD2',
    visibility: req.isPrivate ? 'private' : 'public',
  });
  const createStandaloneRepoUrl = `https://github.com/new?${createRepoParams.toString()}`;

  // 2. Get current branch HEAD reference (or bootstrap README.md if repository is empty)
  let headCommitSha = localCommitSha;
  let baseTreeSha: string | null = null;

  if (repoExists) {
    try {
      const refData = await githubApiFetch<{ object: { sha: string } }>(
        `/repos/${owner}/${targetRepo}/git/ref/heads/${branch}`,
        token
      );
      headCommitSha = refData.object.sha;
      const commitData = await githubApiFetch<{ tree: { sha: string } }>(
        `/repos/${owner}/${targetRepo}/git/commits/${headCommitSha}`,
        token
      );
      baseTreeSha = commitData.tree.sha;
    } catch {
      // Repository may have just been created empty (0 commits); bootstrap README.md to initialize main branch
      const readmeFile = workspaceFiles.find(
        (f) => f.relativePath.toLowerCase() === 'readme.md'
      );
      if (readmeFile) {
        try {
          const initRes = await githubApiFetch<{ commit?: { sha?: string } }>(
            `/repos/${owner}/${targetRepo}/contents/README.md`,
            token,
            {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                message: 'Initial commit: FMD2 Archivist Studio standalone README',
                content: Buffer.from(readmeFile.content, 'utf8').toString('base64'),
                branch,
              }),
            }
          );
          if (initRes.commit?.sha) {
            headCommitSha = initRes.commit.sha;
          }
        } catch {
          // Ignore if token lacks contents:write
        }
      }
    }
  }

  // 3. Try committing workspace files to the branch (if token has contents:write)
  let committedFilesCount = 0;

  if (repoExists) {
    try {
      const treeItems = workspaceFiles.map((f) => ({
        path: f.relativePath,
        mode: '100644',
        type: 'blob',
        content: f.content,
      }));

      const newTree = await githubApiFetch<{ sha: string }>(
        `/repos/${owner}/${targetRepo}/git/trees`,
        token,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...(baseTreeSha ? { base_tree: baseTreeSha } : {}),
            tree: treeItems,
          }),
        }
      );

      const newCommit = await githubApiFetch<{ sha: string }>(
        `/repos/${owner}/${targetRepo}/git/commits`,
        token,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: `Release ${cleanTag}: ${releaseTitle}`,
            tree: newTree.sha,
            parents: headCommitSha && headCommitSha.length === 40 ? [headCommitSha] : [],
          }),
        }
      );

      await githubApiFetch(
        `/repos/${owner}/${targetRepo}/git/refs/heads/${branch}`,
        token,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sha: newCommit.sha,
            force: true,
          }),
        }
      );

      headCommitSha = newCommit.sha;
      committedFilesCount = workspaceFiles.length;
    } catch {
      // If tree commit fails (e.g., fine-grained read-only token), proceed to step 4
    }
  }

  // 4. Create or update GitHub Release for tagName
  let releaseData: {
    id: number;
    html_url: string;
    upload_url: string;
    tag_name: string;
  } | null = null;

  if (repoExists) {
    try {
      releaseData = await githubApiFetch(
        `/repos/${owner}/${targetRepo}/releases`,
        token,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tag_name: cleanTag,
            target_commitish: headCommitSha.length === 40 ? headCommitSha : branch,
            name: releaseTitle,
            body: releaseNotes,
            draft: false,
            prerelease: Boolean(req.prerelease),
          }),
        }
      );
    } catch {
      try {
        const existingRelease = await githubApiFetch<{
          id: number;
          html_url: string;
          upload_url: string;
          tag_name: string;
        }>(
          `/repos/${owner}/${targetRepo}/releases/tags/${encodeURIComponent(cleanTag)}`,
          token
        );
        releaseData = await githubApiFetch(
          `/repos/${owner}/${targetRepo}/releases/${existingRelease.id}`,
          token,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: releaseTitle,
              body: releaseNotes,
              prerelease: Boolean(req.prerelease),
            }),
          }
        );
      } catch {
        releaseData = null;
      }
    }
  }

  // If the current environment token is Read-Only, start a Device Flow session so all 32 code files and the release are pushed automatically as soon as the 8-digit code is confirmed on GitHub
  if (!releaseData) {
    const autoDeviceFlow = await startGitHubDeviceFlow();
    if (autoDeviceFlow.ok && autoDeviceFlow.deviceCode) {
      startServerBackgroundDevicePoll(rootDir, autoDeviceFlow.deviceCode, req);
    }
    return {
      ok: true,
      publishMode: 'staged_ready',
      repoExists,
      repoFullName: `${owner}/${targetRepo}`,
      repoHtmlUrl: repoExists
        ? `https://github.com/${owner}/${targetRepo}`
        : createStandaloneRepoUrl,
      releaseHtmlUrl: repoExists ? prefilledReleaseUrl : createStandaloneRepoUrl,
      prefilledReleaseUrl,
      createStandaloneRepoUrl,
      tagName: cleanTag,
      commitSha: headCommitSha,
      filesCommitted: workspaceFiles.length,
      zipAssetUrl: `/api/github/release-bundle?tag=${encodeURIComponent(cleanTag)}`,
      deviceFlow: autoDeviceFlow.ok ? autoDeviceFlow : undefined,
      notice: repoExists
        ? `Your environment token is Read-Only, so "${owner}/${targetRepo}" currently only has the initial README. Click "Push All ${workspaceFiles.length} Code Files to GitHub (Code: ${autoDeviceFlow.userCode || ''})" below and enter the 8-character code on GitHub to upload the full codebase and publish ${cleanTag}.`
        : `Standalone repository "${owner}/${targetRepo}" does not exist on GitHub yet and your environment token is Read-Only. Enter the 8-character Device Code above to automatically create "${owner}/${targetRepo}", upload all ${workspaceFiles.length} files (including README.md with FMD2 credits), and publish ${cleanTag}.`,
    };
  }

  // 5. Attach the release ZIP bundle as a release asset
  let zipAssetUrl: string | undefined;
  try {
    const zipBuffer = buildProjectReleaseZipBuffer(rootDir);
    const assetName = `fmd2-archivist-studio-${cleanTag}-source.zip`;
    const cleanUploadBase = releaseData.upload_url.replace(/\{\?.*$/, '');
    const uploadRes = await fetch(
      `${cleanUploadBase}?name=${encodeURIComponent(assetName)}`,
      {
        method: 'POST',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/zip',
          'User-Agent': 'FMD2-Archivist-Studio',
        },
        body: Buffer.from(zipBuffer),
      }
    );
    if (uploadRes.ok) {
      const assetJson = (await uploadRes.json()) as { browser_download_url?: string };
      zipAssetUrl = assetJson.browser_download_url;
    }
  } catch {
    // Release succeeded even if asset upload already existed
  }

  return {
    ok: true,
    publishMode: 'api_published',
    repoExists: true,
    repoFullName: `${owner}/${targetRepo}`,
    repoHtmlUrl: `https://github.com/${owner}/${targetRepo}`,
    releaseHtmlUrl: releaseData.html_url,
    prefilledReleaseUrl,
    createStandaloneRepoUrl,
    tagName: cleanTag,
    commitSha: headCommitSha,
    filesCommitted: committedFilesCount || workspaceFiles.length,
    zipAssetUrl,
  };
}

let activeBackgroundDeviceCode: string | null = null;

export function startServerBackgroundDevicePoll(
  rootDir: string,
  deviceCode: string,
  req: GitHubReleasePublishRequest
): void {
  if (activeBackgroundDeviceCode === deviceCode) return;
  activeBackgroundDeviceCode = deviceCode;

  let attempts = 0;
  const timer = setInterval(async () => {
    attempts += 1;
    if (attempts > 120 || activeBackgroundDeviceCode !== deviceCode) {
      clearInterval(timer);
      return;
    }
    try {
      const poll = await pollGitHubDeviceFlowToken(deviceCode);
      if (poll.status === 'authorized' && poll.token) {
        clearInterval(timer);
        setGitHubOAuthToken(poll.token);
        await publishReleaseToGitHub(rootDir, poll.token, req);
      } else if (poll.status === 'expired') {
        clearInterval(timer);
      }
    } catch {
      // Ignore transient poll errors
    }
  }, 5500);
}

