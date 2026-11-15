/**
 * GET /api/institutions
 *
 * The fund list for the Discover section and drill-down pages — public, no
 * auth required. The read itself, and why it is safe to serve publicly, is
 * loadFundSummaries (lib/institutions/fund-summaries.ts), shared with the
 * server-rendered pages.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withRateLimit, addSecurityHeaders } from '@/lib/security/api-security';
import { loadFundSummaries } from '@/lib/institutions/fund-summaries';

export type { SectorWeight, InstitutionalFundSummary } from '@/lib/institutions/fund-summaries';

async function handler(_request: NextRequest): Promise<NextResponse> {
  try {
    const res = NextResponse.json({ success: true, funds: await loadFundSummaries() });
    // Public and the same for everyone (the list is cached an hour server-side
    // anyway): from the CDN, Discover's fund row doesn't wait on a function
    // (4.4s cold on 2026-11-15).
    res.headers.set('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    return addSecurityHeaders(res);
  } catch (err) {
    console.error('[institutions] failed:', err);
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Failed to load institutional investors' }, { status: 500 })
    );
  }
}

export const GET = withRateLimit(handler, { windowMs: 60 * 1000, maxRequests: 60 });
