/**
 * Saved-screen new-match alerts (Pro).
 * GET /api/cron/check-saved-screens
 *
 * Weekdays 11:00 UTC (vercel.json), before the US open and after the night's
 * screener_stats refresh jobs (22:00, 01:00 and 03:00 UTC, which GitHub can
 * start hours late). Re-runs every saved screen with its alert on against
 * screener_stats and notifies the owner of stocks that newly match
 * (lib/screener/saved-screen-alerts.ts). No TwelveData calls, no AI.
 *
 * ?dryRun=1 computes and returns what would be sent, writes nothing.
 * &userId=<uuid> limits the run to one user's screens.
 */
import { NextRequest, NextResponse } from 'next/server';
import { withCronReport } from '@/lib/cron/report';
import { logSecurityEvent } from '@/lib/security/security-events';
import { createServerClient } from '@/lib/supabase/client';
import { runSavedScreenAlerts, createSavedScreenNotification } from '@/lib/screener/saved-screen-alerts';
import { pushNow } from '@/lib/notifications/push-dispatch';

export const maxDuration = 120;

async function handleGET(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    logSecurityEvent('cron_secret_mismatch', { path: '/api/cron/check-saved-screens' });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sp = request.nextUrl.searchParams;
  const dryRun = sp.get('dryRun') === '1';
  const userId = sp.get('userId') ?? undefined;
  const notifiedUsers = new Set<string>();

  try {
    const summary = await runSavedScreenAlerts(
      createServerClient(),
      async (p) => {
        const ok = await createSavedScreenNotification(p);
        if (ok) notifiedUsers.add(p.userId);
        return ok;
      },
      { dryRun, userId },
    );
    // Push now rather than waiting for dispatch-push; the planner still holds quiet hours and the daily cap.
    const { pushed, pushErrors } = await pushNow(notifiedUsers);
    return NextResponse.json({ ...summary, pushed, errors: [...summary.errors, ...pushErrors] });
  } catch (err) {
    return NextResponse.json({ error: String(err), errors: [String(err)] }, { status: 500 });
  }
}

export const GET = withCronReport('check-saved-screens', handleGET);
