/**
 * Morning alert email cron
 * GET /api/cron/send-alert-email
 *
 * Runs twice a day (vercel.json), each run for the readers whose morning it is
 * (emailSlot): 08:30 UTC for Europe and the rest of the world, 12:00 UTC
 * (7-8 AM in New York) for the Americas. Both come after the 08:00 earnings and
 * ex-dividend crons and the previous close's 21:30 big-move run. The run picks
 * its slot from the UTC hour (Hobby fires anywhere in the hour); `?slot=early|americas|all`
 * overrides. See lib/email/alert-email.ts. `?dryRun=1` builds without sending;
 * `?userId=` limits the run to one account.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withCronReport } from '@/lib/cron/report';
import { logSecurityEvent } from '@/lib/security/security-events';
import { sendMorningAlertEmails, type EmailSlot } from '@/lib/email/alert-email';

export const maxDuration = 120;

async function handleGET(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    logSecurityEvent('cron_secret_mismatch', { path: '/api/cron/send-alert-email' });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const slotParam = params.get('slot');
  const slot: EmailSlot | undefined =
    slotParam === 'early' || slotParam === 'americas' ? slotParam
    : slotParam === 'all' ? undefined
    : new Date().getUTCHours() < 11 ? 'early' : 'americas';
  const run = await sendMorningAlertEmails({
    dryRun: params.get('dryRun') === '1',
    userId: params.get('userId') ?? undefined,
    slot,
  });
  // Previews are for local scripts; a cron response doesn't need the HTML.
  const { previews, ...summary } = run;
  return NextResponse.json({ ...summary, previews: previews?.map(({ html: _html, ...p }) => p) });
}

export const GET = withCronReport('send-alert-email', handleGET);
