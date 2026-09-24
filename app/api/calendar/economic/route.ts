/**
 * GET /api/calendar/economic?from=&to=
 *
 * Scheduled US economic releases (jobs report, CPI, Fed decisions...) in an
 * ET date range. Read straight from `economic_events`, which the weekly sync
 * cron fills from the agencies' own schedules, so no provider call and no
 * credits here.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withRateLimit } from '@/lib/security/api-security';
import { getEconomicEvents } from '@/lib/market-data/economic-calendar';
import { todayET } from '@/lib/dates/calendar-format';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** A month view is at most 42 days; anything far beyond that is not a calendar request. */
const MAX_SPAN_DAYS = 62;

async function handler(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = request.nextUrl;
  const from = searchParams.get('from') ?? todayET();
  const to = searchParams.get('to') ?? from;
  if (!DATE_RE.test(from) || !DATE_RE.test(to) || to < from) {
    return NextResponse.json({ success: false, error: 'Invalid date range' }, { status: 400 });
  }
  if ((Date.parse(to) - Date.parse(from)) / 86_400_000 > MAX_SPAN_DAYS) {
    return NextResponse.json({ success: false, error: 'Range too long' }, { status: 400 });
  }

  try {
    const rows = await getEconomicEvents(from, to);
    const data = rows.map(({ source: _source, ...event }) => event);
    return NextResponse.json(
      { success: true, data },
      // Schedules change a few times a year at most; the sync runs weekly.
      { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } },
    );
  } catch (error) {
    console.error('[calendar/economic] read failed', error);
    return NextResponse.json({ success: false, error: 'Failed to load economic calendar' }, { status: 500 });
  }
}

export const GET = withRateLimit(handler, { windowMs: 60_000, maxRequests: 60 });
