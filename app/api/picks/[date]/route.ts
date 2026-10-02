/**
 * GET /api/picks/[date]
 *
 * One pick by its publication date (YYYY-MM-DD) — the canonical URL key, since
 * exactly one pick exists per date and the date is what the track record is
 * built on. Public, no auth required — same tier/quota boundary as
 * /api/picks/current.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, withOptionalAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { TwelveDataRateLimitError } from '@/lib/twelvedata/twelvedata-client';
import { resolveThesisAccess } from '@/lib/picks/thesis-access';
import { getPickRowByDate, toDetail } from '@/lib/picks/picks-db';
import { livePerformanceFor } from '@/lib/picks/performance';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

async function load(
  _request: NextRequest,
  context: unknown,
  session: { userId: string } | null,
  redeem: boolean
): Promise<NextResponse> {
  const { date } = await (context as { params: Promise<{ date: string }> }).params;

  if (!DATE_RE.test(date)) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Invalid date' }, { status: 400 })
    );
  }

  try {
    const row = await getPickRowByDate(date);
    if (!row) {
      return addSecurityHeaders(
        NextResponse.json({ success: false, error: 'Pick not found' }, { status: 404 })
      );
    }

    const [access, perf] = await Promise.all([
      resolveThesisAccess(session, row.pick_date, row.model, { redeem }),
      livePerformanceFor(row),
    ]);

    return addSecurityHeaders(
      NextResponse.json({ success: true, pick: toDetail(row, perf, access) })
    );
  } catch (err) {
    if (err instanceof TwelveDataRateLimitError) {
      return addSecurityHeaders(NextResponse.json({ success: false, error: 'plan_restricted' }, { status: 200 }));
    }
    console.error(`[picks/${date}] failed:`, err);
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Failed to load pick' }, { status: 500 })
    );
  }
}

export const GET = withOptionalAuth((req, ctx, session) => load(req, ctx, session, false), {
  rateLimit: { windowMs: 60 * 1000, maxRequests: 60 },
});

/** Spend a free account's monthly thesis on this pick: the only thing that does. */
export const POST = withAuth((req, ctx, session) => load(req, ctx, session, true), {
  rateLimit: { windowMs: 60 * 1000, maxRequests: 10 },
});
