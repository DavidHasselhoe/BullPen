/**
 * GET /api/picks/current
 *
 * The latest published pick — public, no auth required. The ticker, headline,
 * one-liner, entry price, and live return are always free; the thesis and
 * risks are gated by resolveThesisAccess() (Pro, or a free account's one
 * thesis a month) and stripped server-side by `toDetail`, never sent to a
 * caller who isn't unlocked.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withOptionalAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { TwelveDataRateLimitError } from '@/lib/twelvedata/twelvedata-client';
import { resolveThesisAccess } from '@/lib/picks/thesis-access';
import { getLatestPickRow, toDetail } from '@/lib/picks/picks-db';
import { livePerformanceFor } from '@/lib/picks/performance';

async function handler(
  _request: NextRequest,
  _context: unknown,
  session: { userId: string } | null
): Promise<NextResponse> {
  try {
    const row = await getLatestPickRow();
    if (!row) {
      return addSecurityHeaders(NextResponse.json({ success: true, pick: null }));
    }

    const [access, perf] = await Promise.all([
      resolveThesisAccess(session, row.pick_date, row.model),
      livePerformanceFor(row),
    ]);

    return addSecurityHeaders(
      NextResponse.json({ success: true, pick: toDetail(row, perf, access) })
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

export const GET = withOptionalAuth(handler, { rateLimit: { windowMs: 60 * 1000, maxRequests: 60 } });
