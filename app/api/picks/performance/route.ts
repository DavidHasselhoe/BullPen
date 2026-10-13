/**
 * GET /api/picks/performance
 *
 * The whole track record in one payload: the calendar-time equal-dollar series,
 * the day-0 normalized curve, per-pick returns, and the summary figures.
 * Public, no auth required — every field here is summary-level (picks-db.ts's
 * PICK_SUMMARY_COLUMNS), never the thesis, so there's no tier boundary to
 * enforce. The whole point of a track record is that anyone can check it
 * without signing up first.
 *
 * Computed server-side so the browser never fires one candle request per pick,
 * and cached in Redis for 30 minutes — the underlying picks only change weekly,
 * and the live quotes inside are refreshed on each recompute.
 *
 * This route is also where entry prices get stamped (see lib/picks/performance.ts),
 * so it is the only place that ever writes to ai_stock_picks outside the cron.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withRateLimit, addSecurityHeaders } from '@/lib/security/api-security';
import { TwelveDataRateLimitError } from '@/lib/twelvedata/twelvedata-client';
import { getCachedPerformance } from '@/lib/picks/performance';
import { QUARTER_RE } from '@/lib/picks/quarters';

async function handler(request: NextRequest): Promise<NextResponse> {
  // ?quarter=2026-Q3 scopes the record to picks made in that quarter.
  const param = request.nextUrl.searchParams.get('quarter');
  if (param && !QUARTER_RE.test(param)) {
    return addSecurityHeaders(NextResponse.json({ success: false, error: 'Invalid quarter' }, { status: 400 }));
  }

  try {
    const result = await getCachedPerformance(param ?? undefined);
    return addSecurityHeaders(NextResponse.json({ success: true, ...result }));
  } catch (err) {
    if (err instanceof TwelveDataRateLimitError) {
      return addSecurityHeaders(NextResponse.json({ success: false, error: 'plan_restricted' }, { status: 200 }));
    }
    console.error('[picks/performance] failed:', err);
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Failed to compute track record' }, { status: 500 })
    );
  }
}

export const GET = withRateLimit(handler, { windowMs: 60 * 1000, maxRequests: 30 });
