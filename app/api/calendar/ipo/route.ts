/**
 * GET /api/calendar/ipo?from=&to=&per_day=
 *
 * Upcoming IPOs. Deliberately NOT universe-filtered: a pre-listing company is
 * in no screener universe by definition, so filtering would return nothing.
 * For the same reason these rows have no market cap and sort last, and some
 * carry an empty `symbol` (attachCalendarMeta resolves those to null rather
 * than throwing).
 */

import { NextRequest, NextResponse } from 'next/server';
import { withRateLimit } from '@/lib/security/api-security';
import { handleCalendarRequest } from '../shared-handler';

export const maxDuration = 60;

async function handler(request: NextRequest): Promise<NextResponse> {
  return handleCalendarRequest(request, {
    kind: 'ipo',
    filterToUniverse: false,
    dateField: 'date',
  });
}

export const GET = withRateLimit(handler, { windowMs: 60_000, maxRequests: 60 });
