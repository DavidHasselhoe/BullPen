// Shared logo resolution — TwelveData first, logo.dev fallback.
// Used by both the live self-healing proxy (app/api/logo/[ticker]/route.ts)
// and offline backfill scripts, so the two never drift.

import { getLogoUrl } from '@/lib/twelvedata/twelvedata-client';
import { uploadLogoToStorage } from './logos-storage';
import { updateCompanyLogo } from './logos-db';

export interface ResolvedLogoImage {
  buffer: Buffer;
  mimeType: string;
  /** The external URL the image was validated against. */
  sourceUrl: string;
}

export type LogoSource = 'brand' | 'logo.dev';

export interface LogoResolution {
  success: boolean;
  url?: string;
  source?: LogoSource;
  error?: string;
}

/**
 * Below this, real logos in our own storage bucket don't go (smallest
 * confirmed legitimate one is 2249 bytes) — but TwelveData and logo.dev have
 * both been observed returning a "real" 200 image response for tickers they
 * don't have: a blank white square (DLO: 1189 bytes, BETA: 1676 bytes) or a
 * generic "No Image" placeholder icon (1696 bytes). Neither is an HTTP error,
 * so the content-type/non-empty check below doesn't catch them, and they'd
 * otherwise get cached as the ticker's logo for 30 days straight over the
 * initials fallback.
 */
const MIN_LOGO_BYTES = 2000;

/**
 * Downloads a candidate logo URL and confirms it's actually an image before
 * trusting it — a 200 with an HTML error page, an empty body, or a non-2xx
 * status must never be treated as a resolved logo. TwelveData's `/logo`
 * metadata call has been observed returning a URL whose CDN entry itself
 * 404s, so this check is what stands between that and a broken image on-page.
 */
export async function downloadAndValidateLogo(url: string): Promise<ResolvedLogoImage | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.startsWith('image/')) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length < MIN_LOGO_BYTES) return null;
    const mimeType = contentType.split(';')[0]?.trim() || 'image/png';
    return { buffer, mimeType, sourceUrl: url };
  } catch {
    return null;
  }
}

export async function resolveFromTwelveData(sym: string): Promise<ResolvedLogoImage | null> {
  let cdnUrl: string | null = null;
  try {
    cdnUrl = await getLogoUrl(sym);
  } catch {
    cdnUrl = null;
  }
  if (!cdnUrl) return null;
  return downloadAndValidateLogo(cdnUrl);
}

export async function resolveFromLogoDev(sym: string): Promise<ResolvedLogoImage | null> {
  const token = process.env.LOGO_DEV_KEY;
  if (!token) return null;
  // fallback=404 turns a miss into a real 404 instead of a generated monogram
  // placeholder, so downloadAndValidateLogo's content-type check can't be
  // fooled into "resolving" every unknown ticker to logo.dev's default avatar.
  const url = `https://img.logo.dev/ticker/${encodeURIComponent(sym)}?token=${token}&format=png&fallback=404`;
  return downloadAndValidateLogo(url);
}

/**
 * Full pipeline: TwelveData first, logo.dev fallback, upload the winner to
 * our own `company-logos` bucket, and persist it on the company row if one
 * exists. Does not touch the market_data_cache negative/positive cache —
 * that's the live route's concern, not a backfill script's.
 */
export async function resolveAndPersistLogo(
  ticker: string,
  companyId?: string
): Promise<LogoResolution> {
  const sym = ticker.toUpperCase();

  let resolved = await resolveFromTwelveData(sym);
  let source: LogoSource = 'brand';

  if (!resolved) {
    resolved = await resolveFromLogoDev(sym);
    source = 'logo.dev';
  }

  if (!resolved) {
    return { success: false, error: 'No logo found via TwelveData or logo.dev' };
  }

  const uploadResult = await uploadLogoToStorage(sym, resolved.buffer, resolved.mimeType);
  if (!uploadResult.success || !uploadResult.publicUrl) {
    return { success: false, error: uploadResult.error ?? 'Upload to storage failed' };
  }

  if (companyId) {
    await updateCompanyLogo(companyId, uploadResult.publicUrl, source);
  }

  return { success: true, url: uploadResult.publicUrl, source };
}
