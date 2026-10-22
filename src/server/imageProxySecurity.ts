import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const IMAGE_PROXY_SIGNING_KEY = process.env.IMAGE_PROXY_SIGNING_KEY
  ? Buffer.from(process.env.IMAGE_PROXY_SIGNING_KEY, 'utf8')
  : randomBytes(32);

export const IMAGE_PROXY_SIGNATURE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_PROXY_IMAGE_BYTES = 25 * 1024 * 1024;

export function signImageProxyRequest(
  url: string,
  referer: string,
  expiresAt: number
): string {
  return createHmac('sha256', IMAGE_PROXY_SIGNING_KEY)
    .update(`${expiresAt}\n${url}\n${referer}`)
    .digest('base64url');
}

export function verifyImageProxyRequest(
  url: string,
  referer: string,
  expiresAt: number,
  signature: string,
  now = Date.now()
): boolean {
  if (
    !Number.isSafeInteger(expiresAt) ||
    expiresAt < now ||
    expiresAt > now + IMAGE_PROXY_SIGNATURE_TTL_MS ||
    !/^[A-Za-z0-9_-]{43}$/.test(signature)
  ) {
    return false;
  }

  const expected = Buffer.from(signImageProxyRequest(url, referer, expiresAt));
  const actual = Buffer.from(signature);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function isPublicIpv4(address: string): boolean {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }

  const [a, b, c] = parts;
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 0 || b === 168)) ||
    (a === 192 && b === 88 && c === 99) ||
    (a === 198 && (b === 18 || b === 19 || b === 51)) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

function ipv4FromMappedIpv6(address: string): string | null {
  const normalized = address.toLowerCase();
  if (!normalized.startsWith('::ffff:')) return null;

  const tail = normalized.slice('::ffff:'.length);
  if (tail.includes('.')) return tail;

  const groups = tail.split(':');
  if (groups.length !== 2 || groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) {
    return null;
  }
  const high = Number.parseInt(groups[0], 16);
  const low = Number.parseInt(groups[1], 16);
  return [high >> 8, high & 255, low >> 8, low & 255].join('.');
}

function isPublicIpAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return isPublicIpv4(address);
  if (version !== 6) return false;

  const normalized = address.toLowerCase().replace(/^\[|\]$/g, '');
  const mappedIpv4 = ipv4FromMappedIpv6(normalized);
  if (mappedIpv4) return isPublicIpv4(mappedIpv4);

  return !(
    normalized === '::' ||
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    /^fe[89ab]/.test(normalized) ||
    normalized.startsWith('ff') ||
    normalized.startsWith('64:ff9b:')
  );
}

export async function isSafePublicImageUrl(rawUrl: string): Promise<boolean> {
  try {
    const url = new URL(rawUrl);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      !url.hostname ||
      url.port !== '' && url.port !== '443'
    ) {
      return false;
    }

    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
    if (
      hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      hostname.endsWith('.local')
    ) {
      return false;
    }

    if (isIP(hostname)) return isPublicIpAddress(hostname);
    const addresses = await lookup(hostname, { all: true, verbatim: true });
    return addresses.length > 0 && addresses.every(({ address }) => isPublicIpAddress(address));
  } catch {
    return false;
  }
}

export async function fetchPublicImage(
  rawUrl: string,
  referer: string,
  options: { signal?: AbortSignal; maxBytes?: number } = {}
): Promise<{ contentType: string; buffer: Buffer }> {
  const maxBytes = options.maxBytes ?? MAX_PROXY_IMAGE_BYTES;
  let target = new URL(rawUrl);
  const parsedReferer = new URL(referer);
  if (parsedReferer.protocol !== 'https:' || parsedReferer.username || parsedReferer.password) {
    throw new Error('Invalid image referer.');
  }

  for (let redirectCount = 0; redirectCount <= 4; redirectCount++) {
    if (!(await isSafePublicImageUrl(target.href))) {
      throw new Error('Image URL must resolve to a public HTTPS address.');
    }

    const timeoutSignal = AbortSignal.timeout(12_000);
    const signal = options.signal
      ? AbortSignal.any([options.signal, timeoutSignal])
      : timeoutSignal;
    const response = await fetch(target, {
      redirect: 'manual',
      headers: {
        Referer: parsedReferer.href,
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
      },
      signal,
    });

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      await response.body?.cancel().catch(() => undefined);
      if (!location || redirectCount === 4) throw new Error('Image redirect limit exceeded.');
      target = new URL(location, target);
      continue;
    }

    if (!response.ok) throw new Error(`Image source returned HTTP ${response.status}.`);
    const contentType = (response.headers.get('content-type') || '').split(';', 1)[0].trim().toLowerCase();
    if (!contentType.startsWith('image/')) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error('Image source returned a non-image response.');
    }

    const contentLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error('Image exceeds the configured size limit.');
    }

    if (!response.body) throw new Error('Image source returned an empty response.');
    const reader = response.body.getReader();
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new Error('Image exceeds the configured size limit.');
      }
      chunks.push(Buffer.from(value));
    }

    if (totalBytes === 0) throw new Error('Image source returned an empty response.');
    return { contentType, buffer: Buffer.concat(chunks, totalBytes) };
  }

  throw new Error('Image redirect limit exceeded.');
}
