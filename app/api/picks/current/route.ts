/**
 * GET /api/picks/current
 *
 * The latest published pick. The ticker, headline, one-liner, entry price, and
 * live return are free; the thesis and risks are Pro (stripped server-side by
 * `toDetail`, never sent and hidden client-side).
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { TwelveDataRateLimitError } from '@/lib/twelvedata/twelvedata-client';
import { getTier } from '@/lib/billing/tier';
import { getLatestPickRow, toDetail } from '@/lib/picks/picks-db';
import { livePerformanceFor } from '@/lib/picks/performance';

async function handler(
  _request: NextRequest,
  _context: unknown,
  session: { userId: string }
): Promise<NextResponse> {
  try {
    const row = await getLatestPickRow();
    if (!row) {
      return addSecurityHeaders(NextResponse.json({ success: true, pick: null }));
    }

    const [tier, perf] = await Promise.all([getTier(session.userId), livePerformanceFor(row)]);

    return addSecurityHeaders(
      NextResponse.json({ success: true, pick: toDetail(row, perf, tier) })
    );
  } catch (err) {
    if (err instanceof TwelveDataRateLimitError) {
      return addSecurityHeaders(NextResponse.json({ success: false, error: 'plan_restricted' }, { status: 200 }));
    }
    console.error('[picks/current] failed:', err);
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Failed to load the current pick' }, { status: 500 })
    );
  }
}

export const GET = withAuth(handler, { rateLimit: { windowMs: 60 * 1000, maxRequests: 60 } });
