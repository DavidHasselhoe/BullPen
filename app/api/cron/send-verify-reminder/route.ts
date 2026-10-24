/**
 * Verify-your-email reminder cron
 * GET /api/cron/send-verify-reminder
 *
 * Runs daily at 09:00 UTC (vercel.json). One reminder to email signups still
 * unverified 24-48h after signing up, since the morning alert email only goes
 * to verified addresses. See sendVerificationReminders in
 * lib/auth/email-verification.ts. `?dryRun=1` counts without sending.
 */

import { NextRequest, NextResponse } from 'next/server';
import { logSecurityEvent } from '@/lib/security/security-events';
import { sendVerificationReminders } from '@/lib/auth/email-verification';

export const maxDuration = 60;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    logSecurityEvent('cron_secret_mismatch', { path: '/api/cron/send-verify-reminder' });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json(await sendVerificationReminders({ dryRun: request.nextUrl.searchParams.get('dryRun') === '1' }));
}
