/**
 * GET /api/picks/performance
 *
 * The whole track record in one payload: the calendar-time equal-dollar series,
 * the day-0 normalized curve, per-pick returns, and the summary figures.
 *
 * Computed server-side so the browser never fires one candle request per pick,
 * and cached in Redis for 30 minutes — the underlying picks only change weekly,
 * and the live quotes inside are refreshed on each recompute.
 *
 * This route is also where entry prices get stamped (see lib/picks/performance.ts),
 * so it is the only place that ever writes to ai_stock_picks outside the cron.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { TwelveDataRateLimitError } from '@/lib/twelvedata/twelvedata-client';
import { rget, rset } from '@/lib/cache/redis-cache';
import { computePerformance } from '@/lib/picks/performance';
import type { PerformanceResponse } from '@/lib/picks/types';

/** Bump the version suffix whenever the payload's shape or semantics change,
 *  so a deploy doesn't serve the previous shape for another 30 minutes. */
const CACHE_KEY = 'picks:performance:v2';
const CACHE_TTL_SECONDS = 30 * 60;

async function handler(
  _request: NextRequest,
  _context: unknown,
   
  _session: { userId: string }
): Promise<NextResponse> {
  try {
    const cached = await rget<PerformanceResponse>(CACHE_KEY);
    if (cached) {
      return addSecurityHeaders(NextResponse.json({ success: true, ...cached, cached: true }));
    }

    const result = await computePerformance();
    void rset(CACHE_KEY, result, CACHE_TTL_SECONDS);

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

export const GET = withAuth(handler, { rateLimit: { windowMs: 60 * 1000, maxRequests: 30 } });
