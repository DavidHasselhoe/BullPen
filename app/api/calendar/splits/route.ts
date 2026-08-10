/**
 * GET /api/calendar/splits?from=&to=&per_day=
 *
 * Stock splits. Same shared per-day cache and universe filter as dividends —
 * see that route for why the filter widened from SIGNIFICANT_TICKERS.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withRateLimit } from '@/lib/security/api-security';
import { handleCalendarRequest } from '../shared-handler';

export const maxDuration = 60;

async function handler(request: NextRequest): Promise<NextResponse> {
  return handleCalendarRequest(request, {
    kind: 'splits',
    filterToUniverse: true,
    dateField: 'date',
  });
}

export const GET = withRateLimit(handler, { windowMs: 60_000, maxRequests: 60 });
