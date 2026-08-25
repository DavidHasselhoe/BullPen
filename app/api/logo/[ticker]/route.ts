import { NextRequest, NextResponse } from 'next/server';
import { uploadLogoToStorage } from '@/lib/logos/logos-storage';
import { resolveFromTwelveData, resolveFromLogoDev } from '@/lib/logos/resolve-logo';
import { addSecurityHeaders } from '@/lib/security/api-security';
import { createServerClient } from '@/lib/supabase/client';
import { getCached, setCached } from '@/lib/cache/market-data-cache';
import { slugToSymbol } from '@/lib/assets/asset-type';

/**
 * GET /api/logo/[ticker]
 *
 * Self-healing logo proxy. Returns a 302 redirect to the resolved image URL
 * so `<Image src="/api/logo/MRVL" />` works directly — Next.js' image
 * optimizer follows the redirect, caches the optimized result, and serves
 * future requests from its own CDN without ever hitting this route again.
 *
 * Resolution order:
 *   1. market_data_cache  (30-day positive / 24-hour negative cache)
 *   2. companies.logo_url (DB source of truth — instant)
 *   3. TwelveData /logo   (1 credit) — download the image it points to and
 *                          VALIDATE it's actually a real image before trusting
 *                          it. TwelveData's /logo metadata call can return a
 *                          URL for a symbol whose CDN entry 404s (this was
 *                          the actual bug behind BAC/MS-class logos being
 *                          broken: the old code redirected straight to that
 *                          URL and cached the broken redirect as a 30-day hit).
 *   4. logo.dev ticker API — only tried when step 3 fails to produce a real
 *                          image. Same validate-before-trust treatment.
 *
 * Whichever source wins is downloaded once, uploaded to our own
 * `company-logos` bucket, and persisted on `companies.logo_url` so we never
 * pay for (or re-validate) the same ticker twice.
 *
 * Returns 404 on truly unresolvable tickers so the calling `<CompanyLogo>`
 * `onError` handler can fall through to the initials fallback.
 */

const HIT_TTL_SEC  = 30 * 24 * 60 * 60;  // 30 days — logos are stable
const MISS_TTL_SEC = 24 * 60 * 60;       // 1 day — retry missing logos daily
const DEGRADED_TTL_SEC = 60 * 60;        // 1 hour — a validated image we couldn't persist to our own bucket; retry the upload soon

interface LogoCacheEntry {
  url: string | null;  // null = negative cache
}

function redirectTo(url: string): NextResponse {
  // 302 (Found) — Next.js image optimizer follows. `Cache-Control` is honored
  // by browsers caching the redirect itself; the optimizer caches the final image.
  const res = NextResponse.redirect(url, 302);
  res.headers.set('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
  return addSecurityHeaders(res);
}

function notFound(): NextResponse {
  // Short cache so a newly-added logo upstream becomes available within ~1 day.
  return addSecurityHeaders(
    new NextResponse(null, {
      status: 404,
      headers: { 'Cache-Control': 'public, s-maxage=86400' },
    })
  );
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await context.params;
  if (!ticker) return notFound();

  const sym = slugToSymbol(ticker.trim()).toUpperCase();
  if (!/^[A-Z0-9.\-/]+$/.test(sym)) return notFound();

  const cacheKey = `logo:${sym}`;

  // ── 1. Cache lookup ───────────────────────────────────────────────────────
  const cached = await getCached<LogoCacheEntry>(cacheKey);
  if (cached) {
    if (cached.url) return redirectTo(cached.url);
    return notFound();
  }

  const supabase = createServerClient();

  // ── 2. companies.logo_url ────────────────────────────────────────────────
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: company } = (await (supabase as any)
      .from('companies')
      .select('id, logo_url')
      .eq('ticker', sym)
      .maybeSingle()) as { data: { id: string; logo_url: string | null } | null };

    if (company?.logo_url) {
      void setCached(cacheKey, sym, 'logo', { url: company.logo_url }, HIT_TTL_SEC);
      return redirectTo(company.logo_url);
    }
  } catch {
    // Non-fatal — fall through to TwelveData / logo.dev
  }

  // ── 3. TwelveData first; stop here if it resolves to a real image ────────
  let resolved = await resolveFromTwelveData(sym);
  let source: 'brand' | 'logo.dev' = 'brand';

  // ── 4. logo.dev fallback — only when TwelveData didn't pan out ───────────
  if (!resolved) {
    resolved = await resolveFromLogoDev(sym);
    source = 'logo.dev';
  }

  if (!resolved) {
    void setCached(cacheKey, sym, 'logo', { url: null }, MISS_TTL_SEC);
    return notFound();
  }

  // Persist to our own bucket so we control the URL & never re-fetch or
  // re-validate this ticker against TwelveData/logo.dev again.
  let finalUrl = resolved.sourceUrl;
  let cacheTtl = DEGRADED_TTL_SEC;

  const uploadResult = await uploadLogoToStorage(sym, resolved.buffer, resolved.mimeType);
  if (uploadResult.success && uploadResult.publicUrl) {
    finalUrl = uploadResult.publicUrl;
    cacheTtl = HIT_TTL_SEC;

    // Persist to companies if it exists — best-effort.
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: row } = (await (supabase as any)
        .from('companies')
        .select('id')
        .eq('ticker', sym)
        .maybeSingle()) as { data: { id: string } | null };
      if (row?.id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any)
          .from('companies')
          .update({
            logo_url: uploadResult.publicUrl,
            logo_source: source,
            logo_updated_at: new Date().toISOString(),
          })
          .eq('id', row.id);
      }
    } catch {
      // Companies update is best-effort
    }
  }

  void setCached(cacheKey, sym, 'logo', { url: finalUrl }, cacheTtl);
  return redirectTo(finalUrl);
}
