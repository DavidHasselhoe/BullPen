/**
 * Economic calendar sync
 * GET /api/cron/sync-economic-calendar
 *
 * Weekly. Pulls the BLS and BEA release calendars, the hand-seeded FOMC
 * dates and the Thursday jobless-claims rule into `economic_events`, then
 * refreshes the result series in `economic_observations` from FRED. No
 * TwelveData credits. Each source fails soft and is reported in the
 * response; see lib/market-data/economic-calendar.ts.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withCronReport } from '@/lib/cron/report';
import { logSecurityEvent } from '@/lib/security/security-events';
import { syncEconomicCalendar } from '@/lib/market-data/economic-calendar';
import { syncEconomicObservations } from '@/lib/market-data/economic-results';

export const maxDuration = 60;

async function handleGET(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    logSecurityEvent('cron_secret_mismatch', { path: '/api/cron/sync-economic-calendar' });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await syncEconomicCalendar();
  const failed = Object.entries(result.sources).filter(([, s]) => !s.ok);
  if (failed.length > 0) console.error('[sync-economic-calendar] sources failed', failed);
  // The results pages' history, revisions included (FRED, free).
  const observations = await syncEconomicObservations();
  const failedSeries = Object.entries(observations).filter(([, s]) => !s.ok);
  if (failedSeries.length > 0) console.error('[sync-economic-calendar] observations failed', failedSeries);
  return NextResponse.json({ ...result, observations });
}

export const GET = withCronReport('sync-economic-calendar', handleGET);
