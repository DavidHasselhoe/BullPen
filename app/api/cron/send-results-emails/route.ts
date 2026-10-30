/**
 * Earnings-results emails for signed-out subscribers
 * GET /api/cron/send-results-emails
 *
 * Daily 12:30 UTC (vercel.json): the morning in New York, after last night's
 * reports and most pre-market ones have actuals on the calendar. A report
 * whose actual isn't in yet goes out on a later run (lib/email/results-subscriptions.ts).
 * `?dryRun=1` counts without sending.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withCronReport } from '@/lib/cron/report';
import { logSecurityEvent } from '@/lib/security/security-events';
import { sendResultsEmails } from '@/lib/email/results-subscriptions';

export const maxDuration = 120;

async function handleGET(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    logSecurityEvent('cron_secret_mismatch', { path: '/api/cron/send-results-emails' });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json(await sendResultsEmails({ dryRun: request.nextUrl.searchParams.get('dryRun') === '1' }));
}

export const GET = withCronReport('send-results-emails', handleGET);
