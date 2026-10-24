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
    return addSecurityHeaders(NextResponse.json({ success: true, funds: await loadFundSummaries() }));
  } catch (err) {
    console.error('[institutions] failed:', err);
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Failed to load institutional investors' }, { status: 500 })
    );
  }
}

export const GET = withRateLimit(handler, { windowMs: 60 * 1000, maxRequests: 60 });
