/**
 * Economic calendar sync
 * GET /api/cron/sync-economic-calendar
 *
 * Weekly. Pulls the BLS and BEA release calendars, the hand-seeded FOMC
 * dates and the Thursday jobless-claims rule into `economic_events`. No
 * TwelveData credits. Each source fails soft and is reported in the
 * response; see lib/market-data/economic-calendar.ts.
 */

import { NextRequest, NextResponse } from 'next/server';
import { logSecurityEvent } from '@/lib/security/security-events';
import { syncEconomicCalendar } from '@/lib/market-data/economic-calendar';

export const maxDuration = 60;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    logSecurityEvent('cron_secret_mismatch', { path: '/api/cron/sync-economic-calendar' });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await syncEconomicCalendar();
  const failed = Object.entries(result.sources).filter(([, s]) => !s.ok);
  if (failed.length > 0) console.error('[sync-economic-calendar] sources failed', failed);
  return NextResponse.json(result);
}
