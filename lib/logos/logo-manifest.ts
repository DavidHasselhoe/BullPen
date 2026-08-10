/**
 * Which tickers actually have a logo object in the `company-logos` bucket.
 *
 * WHY: calendar views render dozens to hundreds of logos at once and they have
 * to appear in one wave, not resolve one by one. `CompanyLogo` without a
 * `logoUrl` prop falls back to `/api/logo/[ticker]`, which is a 302 redirect
 * chain (two round trips per logo) marked `loading="lazy"` — exactly the
 * gradual fill-in we're trying to avoid. Passing a direct storage URL makes it
 * a single un-deferred request.
 *
 * WHY A MANIFEST rather than always emitting `getStorageLogoUrl(ticker)`:
 * only ~55% of the tier-1 universe has an object in the bucket (though ~98% of
 * the top 100 by market cap does, which is what a market-cap-sorted view
 * actually shows). Emitting a URL for the missing 45% would 404 on every
 * render AND never self-heal, freezing coverage forever. Emitting null instead
 * routes those through `/api/logo/[ticker]`, which fetches from TwelveData
 * once (1 credit), uploads to the bucket, and permanently improves coverage.
 * The tail fixes itself as people browse.
 *
 * Extension is tracked, not just presence: `uploadLogoToStorage` writes .png
 * and .svg too, while `getStorageLogoUrl` only ever builds a .jpg URL — so a
 * presence-only manifest would hand out broken .jpg URLs for png-only tickers.
 */

import { createServerClient } from '@/lib/supabase/client';
import { getCached, setCached } from '@/lib/cache/market-data-cache';

const BUCKET = 'company-logos';
const CACHE_KEY = 'logo-manifest:company-logos';
const TTL_SECONDS = 6 * 60 * 60;
const PAGE_SIZE = 1000;

/** ticker (uppercase) → file extension, e.g. "AAPL" → "jpg" */
export type LogoManifest = Map<string, string>;

/** In-process memo so warm lambda invocations skip even the Supabase read. */
let memo: { at: number; manifest: LogoManifest } | null = null;
const MEMO_MS = 5 * 60 * 1000;

function parseObjectName(name: string): { ticker: string; ext: string } | null {
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return null;
  const ticker = name.slice(0, dot).toUpperCase();
  const ext = name.slice(dot + 1).toLowerCase();
  if (!ticker || !ext) return null;
  return { ticker, ext };
}

async function listAllObjects(): Promise<Record<string, string>> {
  const supabase = createServerClient();
  const out: Record<string, string> = {};
  let offset = 0;

  // Same paging loop as scripts/clear-logo-bucket.ts. ~1200 objects = 2 pages.
  for (let page = 0; page < 50; page++) {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .list('', { limit: PAGE_SIZE, offset });

    if (error) {
      console.error('[logo-manifest] bucket list failed:', error.message);
      break;
    }
    if (!data || data.length === 0) break;

    for (const file of data) {
      const parsed = parseObjectName(file.name);
      if (!parsed) continue;
      // Prefer jpg when a ticker has multiple formats — getStorageLogoUrl's default.
      if (!out[parsed.ticker] || parsed.ext === 'jpg') out[parsed.ticker] = parsed.ext;
    }

    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return out;
}

/**
 * Tickers with a logo object, cached 6h in market_data_cache (plus a short
 * in-process memo). Costs zero TwelveData credits — this is pure storage
 * metadata. Returns an empty manifest on failure, which degrades to the
 * self-healing `/api/logo` path rather than breaking the page.
 */
export async function getLogoManifest(): Promise<LogoManifest> {
  if (memo && Date.now() - memo.at < MEMO_MS) return memo.manifest;

  const cached = await getCached<Record<string, string>>(CACHE_KEY);
  if (cached) {
    const manifest = new Map(Object.entries(cached));
    memo = { at: Date.now(), manifest };
    return manifest;
  }

  const fresh = await listAllObjects();
  if (Object.keys(fresh).length > 0) {
    void setCached(CACHE_KEY, '_market', 'logo_manifest', fresh, TTL_SECONDS);
  }
  const manifest = new Map(Object.entries(fresh));
  memo = { at: Date.now(), manifest };
  return manifest;
}

/**
 * Direct public storage URL for a ticker, or null when the bucket has no
 * object for it (caller should leave `logo_url` null so CompanyLogo can use
 * the self-healing proxy). Pure string building — no network, no DB.
 */
export function logoUrlFromManifest(manifest: LogoManifest, ticker: string): string | null {
  if (!ticker) return null;
  const ext = manifest.get(ticker.toUpperCase());
  if (!ext) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '') ?? '';
  if (!base) return null;
  return `${base}/storage/v1/object/public/${BUCKET}/${ticker.toLowerCase()}.${ext}`;
}

/** Test/diagnostic hook — drops the in-process memo. */
export function resetLogoManifestMemo(): void {
  memo = null;
}
