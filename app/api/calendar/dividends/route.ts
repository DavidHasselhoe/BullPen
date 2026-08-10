/**
 * GET /api/calendar/dividends?from=&to=&per_day=
 *
 * Ex-dividend dates. Reads through the shared per-day cache
 * (lib/market-data/calendar-days.ts) like the other three calendar routes.
 *
 * Universe filter widened from SIGNIFICANT_TICKERS (~530) to the active
 * screener universe (~1,200), matching earnings. With every row now rendered
 * as a market-cap-ranked tile, the old split was visible as an inconsistency:
 * a large-cap dividend payer would vanish while a smaller earnings name showed.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withRateLimit } from '@/lib/security/api-security';
import { handleCalendarRequest } from '../shared-handler';

export const maxDuration = 60;

async function handler(request: NextRequest): Promise<NextResponse> {
  return handleCalendarRequest(request, {
    kind: 'dividends',
    filterToUniverse: true,
    dateField: 'ex_dividend_date',
  });
}

export const GET = withRateLimit(handler, { windowMs: 60_000, maxRequests: 60 });
