import { NextRequest, NextResponse } from 'next/server';
import { getLogoUrl } from '@/lib/twelvedata/twelvedata-client';
import { uploadLogoToStorage } from '@/lib/logos/logos-storage';
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
 *   3. TwelveData /logo   (1 credit; result is downloaded → uploaded to
 *                          our `company-logos` bucket → persisted in DB so
 *                          we never pay for the same ticker twice)
 *
 * Returns 404 on truly unresolvable tickers so the calling `<CompanyLogo>`
 * `onError` handler can fall through to the initials fallback.
 */

const HIT_TTL_SEC  = 30 * 24 * 60 * 60;  // 30 days — logos are stable
const MISS_TTL_SEC = 24 * 60 * 60;       // 1 day — retry missing logos daily

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
    // Non-fatal — fall through to TwelveData
  }

  // ── 3. TwelveData (1 credit) → download → upload to our bucket ───────────
  let cdnUrl: string | null = null;
  try {
    cdnUrl = await getLogoUrl(sym);
  } catch {
    cdnUrl = null;
  }

  if (!cdnUrl) {
    void setCached(cacheKey, sym, 'logo', { url: null }, MISS_TTL_SEC);
    return notFound();
  }

  // Download + upload to our own bucket so we control the URL & never pay
  // TwelveData credits again for this ticker.
  let finalUrl = cdnUrl;
  try {
    const imageRes = await fetch(cdnUrl, { signal: AbortSignal.timeout(8000) });
    if (imageRes.ok) {
      const contentType = imageRes.headers.get('content-type') ?? 'image/png';
      const mimeType = contentType.split(';')[0]?.trim() ?? 'image/png';
      const buffer = Buffer.from(await imageRes.arrayBuffer());
      const uploadResult = await uploadLogoToStorage(sym, buffer, mimeType);
      if (uploadResult.success && uploadResult.publicUrl) {
        finalUrl = uploadResult.publicUrl;

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
                logo_source: 'brand',
                logo_updated_at: new Date().toISOString(),
              })
              .eq('id', row.id);
          }
        } catch {
          // Companies update is best-effort
        }
      }
    }
  } catch {
    // Storage path failed — keep the TwelveData CDN URL as the response
  }

  void setCached(cacheKey, sym, 'logo', { url: finalUrl }, HIT_TTL_SEC);
  return redirectTo(finalUrl);
}
