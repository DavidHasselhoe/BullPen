/**
 * Weekly "What's new"
 * GET /api/cron/notify-release-notes
 *
 * Mondays 13:00 UTC (morning in New York, afternoon in Europe). Sends the past
 * week's highlighted changelog items as one in-app notification per user
 * (lib/notifications/release-notes.ts). No highlights, no notification.
 * `?date=YYYY-MM-DD` runs as if on that day.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withCronReport } from '@/lib/cron/report';
import { logSecurityEvent } from '@/lib/security/security-events';
import { notifyReleaseNotes } from '@/lib/notifications/release-notes';

export const maxDuration = 60;

async function handleGET(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    logSecurityEvent('cron_secret_mismatch', { path: '/api/cron/notify-release-notes' });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const param = request.nextUrl.searchParams.get('date');
  const date = param && /^\d{4}-\d{2}-\d{2}$/.test(param) ? param : new Date().toISOString().slice(0, 10);
  try {
    return NextResponse.json({ date, ...(await notifyReleaseNotes(date)) });
  } catch (error) {
    console.error('[notify-release-notes] failed', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

export const GET = withCronReport('notify-release-notes', handleGET);
