/**
 * Web push dispatcher
 * GET /api/cron/dispatch-push
 *
 * QStash, every 15 minutes. For users with a push subscription, turns their unread, unemailed
 * pushable notifications into one combined push (planUserPush: quiet hours, daily cap, expiry)
 * and sends it to each of their devices. No subscribers = one read, no other queries.
 * No TwelveData credits. The work lives in lib/notifications/push-dispatch.ts, which the alert
 * jobs also call for the users they just notified; this run is the sweep for everything else.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withCronReport } from '@/lib/cron/report';
import { logSecurityEvent } from '@/lib/security/security-events';
import { dispatchPushes } from '@/lib/notifications/push-dispatch';

export const maxDuration = 60;

async function handleGET(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    logSecurityEvent('cron_secret_mismatch', { path: '/api/cron/dispatch-push' });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json(await dispatchPushes());
}

export const GET = withCronReport('dispatch-push', handleGET);
