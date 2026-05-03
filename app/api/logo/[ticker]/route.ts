import { NextRequest, NextResponse } from 'next/server';
import { getLogoUrl } from '@/lib/twelvedata/twelvedata-client';
import { uploadLogoToStorage } from '@/lib/logos/logos-storage';
import { addSecurityHeaders } from '@/lib/security/api-security';
import { createServerClient } from '@/lib/supabase/client';
import { slugToSymbol } from '@/lib/assets/asset-type';

/**
 * GET /api/logo/[ticker]
 *
 * Serves company logos with permanent Supabase Storage caching:
 * 1. Return logo_url from companies table if already stored (0 credits, instant)
 * 2. Fetch CDN URL from TwelveData /logo (1 credit)
 * 3. Download image bytes → upload to company-logos bucket → persist URL in DB
 * 4. Future requests hit step 1 and never touch TwelveData again
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await context.params;
  if (!ticker) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Missing ticker' }, { status: 400 })
    );
  }

  const sym = slugToSymbol(ticker.trim()).toUpperCase();
  const supabase = createServerClient();

  // ── Step 1: Return from DB if already cached ──────────────────────────────
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: company } = await (supabase as any)
      .from('companies')
      .select('id, logo_url')
      .eq('ticker', sym)
      .maybeSingle() as { data: { id: string; logo_url: string | null } | null };

    if (company?.logo_url) {
      return addSecurityHeaders(
        NextResponse.json(
          { success: true, logoUrl: company.logo_url },
          { headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=3600' } }
        )
      );
    }
  } catch {
    // DB lookup failure is non-fatal — fall through to TwelveData
  }

  // ── Step 2: Fetch CDN URL from TwelveData (1 credit) ────────────────────
  let cdnUrl: string | null = null;
  try {
    cdnUrl = await getLogoUrl(sym);
  } catch {
    // TwelveData error — return gracefully
  }

  if (!cdnUrl) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, logoUrl: null, error: 'Logo not found' }, { status: 404 })
    );
  }

  // ── Step 3: Download image + upload to Supabase Storage ─────────────────
  try {
    const imageRes = await fetch(cdnUrl, { signal: AbortSignal.timeout(8000) });
    if (!imageRes.ok) throw new Error(`Image fetch failed: ${imageRes.status}`);

    const contentType = imageRes.headers.get('content-type') ?? 'image/png';
    const mimeType = contentType.split(';')[0]?.trim() ?? 'image/png';
    const arrayBuffer = await imageRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const uploadResult = await uploadLogoToStorage(sym, buffer, mimeType);

    if (uploadResult.success && uploadResult.publicUrl) {
      // ── Step 4: Persist the storage URL back to the companies table ───────
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: companyRow } = await (supabase as any)
          .from('companies')
          .select('id')
          .eq('ticker', sym)
          .maybeSingle() as { data: { id: string } | null };

        if (companyRow?.id) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any)
            .from('companies')
            .update({
              logo_url: uploadResult.publicUrl,
              logo_source: 'brand',
              logo_updated_at: new Date().toISOString(),
            })
            .eq('id', companyRow.id);
        }
      } catch {
        // DB update failure is non-fatal — the storage URL is still valid
      }

      return addSecurityHeaders(
        NextResponse.json(
          { success: true, logoUrl: uploadResult.publicUrl },
          { headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=3600' } }
        )
      );
    }
  } catch {
    // Image download / upload failure — fall through to return CDN URL directly
  }

  // ── Fallback: return the TwelveData CDN URL if storage upload failed ─────
  return addSecurityHeaders(
    NextResponse.json(
      { success: true, logoUrl: cdnUrl },
      { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=300' } }
    )
  );
}
