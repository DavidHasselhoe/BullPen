/**
 * GET /api/calendar/earnings?from=&to=&per_day=
 *
 * Rate-limited, not auth-gated (the previous comment here claimed otherwise).
 *
 * Data comes from lib/market-data/calendar-days.ts, which fetches ONE DAY AT A
 * TIME. /earnings_calendar truncates at 1200 rows and silently drops whole
 * days, so the old single-range request was returning 2 rows for a week that
 * really had hundreds. See that module's header for the full evidence.
 *
 * Ranking is market cap descending. The old Nasdaq-100-tier-first sort existed
 * to force megacaps up a list that had no market cap attached yet; screener_stats
 * now covers 99% of the tier-1 universe, so the tier hack is redundant.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withRateLimit } from '@/lib/security/api-security';
import { handleCalendarRequest } from '../shared-handler';

export const maxDuration = 60;

async function handler(request: NextRequest): Promise<NextResponse> {
  return handleCalendarRequest(request, {
    kind: 'earnings',
    filterToUniverse: true,
    dateField: 'date',
  });
}

// 60/min: a single view change fires all four calendar routes, and chevron
// paging multiplies that. The old 20/min tripped after ~5 rapid clicks.
export const GET = withRateLimit(handler, { windowMs: 60_000, maxRequests: 60 });
