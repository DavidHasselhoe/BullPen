/**
 * Morning alert email cron
 * GET /api/cron/send-alert-email
 *
 * Runs daily at 08:30 UTC (vercel.json): after the 08:00 earnings and
 * ex-dividend crons, and picking up the previous close's big moves from the
 * 21:30 run. Before 05:00 in New York, so it is waiting when US users wake.
 * See lib/email/alert-email.ts. `?dryRun=1` builds without sending;
 * `?userId=` limits the run to one account.
 */

import { NextRequest, NextResponse } from 'next/server';
import { logSecurityEvent } from '@/lib/security/security-events';
import { sendMorningAlertEmails } from '@/lib/email/alert-email';

export const maxDuration = 120;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    logSecurityEvent('cron_secret_mismatch', { path: '/api/cron/send-alert-email' });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const run = await sendMorningAlertEmails({
    dryRun: params.get('dryRun') === '1',
    userId: params.get('userId') ?? undefined,
  });
  // Previews are for local scripts; a cron response doesn't need the HTML.
  const { previews, ...summary } = run;
  return NextResponse.json({ ...summary, previews: previews?.map(({ html: _html, ...p }) => p) });
}
