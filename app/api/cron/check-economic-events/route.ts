/**
 * Economic releases today
 * GET /api/cron/check-economic-events
 *
 * Weekdays 08:00 UTC (4 AM ET, before every 8:30 ET release). Notifies users
 * who opted in about today's scheduled releases. Reads `economic_events`
 * only: no provider calls, no credits.
 */

import { NextRequest, NextResponse } from 'next/server';
import { logSecurityEvent } from '@/lib/security/security-events';
import { getEconomicEvents } from '@/lib/market-data/economic-calendar';
import { notifyEconomicEventsToday } from '@/lib/notifications/notification-creators';
import { todayET } from '@/lib/dates/calendar-format';

export const maxDuration = 60;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    logSecurityEvent('cron_secret_mismatch', { path: '/api/cron/check-economic-events' });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const today = request.nextUrl.searchParams.get('date') ?? todayET();
  try {
    const events = await getEconomicEvents(today, today);
    const notified = await notifyEconomicEventsToday(today, events);
    return NextResponse.json({ date: today, events: events.map((e) => e.id), notified });
  } catch (error) {
    console.error('[check-economic-events] failed', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
