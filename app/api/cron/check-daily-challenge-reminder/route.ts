/**
 * Academy Daily Challenge Streak Reminder Cron Job
 * GET /api/cron/check-daily-challenge-reminder
 *
 * Runs once in the evening ET. For every user who:
 *   1. Has daily_challenge_reminder notifications enabled (default true)
 *   2. Has an active Academy streak (current_streak >= 1)
 *   3. Hasn't done anything in Academy yet today (lesson or daily challenge —
 *      last_activity_date != today's ET date)
 * ...creates a "keep your streak alive" reminder notification.
 *
 * Deliberately scoped to users with an existing streak, not every user —
 * this is a "don't lose what you have" nudge, not cold-start Academy
 * marketing to people who've never opened it.
 */

import { NextRequest, NextResponse } from 'next/server';
import { logSecurityEvent } from '@/lib/security/security-events';
import { createServerClient } from '@/lib/supabase/client';
import { todayInET } from '@/lib/academy/streak';
import { createDailyChallengeReminderNotification } from '@/lib/notifications/notification-creators';

export const maxDuration = 60;

export async function GET(request: NextRequest): Promise<NextResponse> {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    logSecurityEvent('cron_secret_mismatch', { path: '/api/cron/check-daily-challenge-reminder' });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServerClient();
  const summary = {
    streaksAtRisk: 0,
    usersNotified: 0,
    errors: [] as string[],
  };

  try {
    // ── 1. Users with an active streak who haven't been active today ────────
    // Queried first (not from `users`) since academy_user_stats is far smaller
    // than the full user base — narrows the candidate set before checking
    // notification settings, rather than scanning every user first.
    const today = todayInET();
    const { data: atRisk, error: statsErr } = await supabase
      .from('academy_user_stats')
      .select('user_id, current_streak')
      .gte('current_streak', 1)
      .neq('last_activity_date', today) as unknown as
      { data: Array<{ user_id: string; current_streak: number }> | null; error: unknown };

    if (statsErr || !atRisk?.length) {
      return NextResponse.json({ ...summary, message: 'No streaks at risk today' });
    }
    summary.streaksAtRisk = atRisk.length;

    // ── 2. Filter to users with the reminder enabled ─────────────────────────
    // daily_challenge_reminder defaults to true when not set.
    const candidateIds = atRisk.map((r) => r.user_id);
    const { data: users, error: usersErr } = await supabase
      .from('users')
      .select('id, settings')
      .in('id', candidateIds)
      .or('settings->notifications->daily_challenge_reminder.is.null,settings->notifications->daily_challenge_reminder.eq.true') as unknown as
      { data: Array<{ id: string }> | null; error: unknown };

    if (usersErr || !users?.length) {
      return NextResponse.json({ ...summary, message: 'No eligible users after settings filter' });
    }

    const eligibleIds = new Set(users.map((u) => u.id));

    // ── 3. Notify ─────────────────────────────────────────────────────────
    for (const row of atRisk) {
      if (!eligibleIds.has(row.user_id)) continue;
      const created = await createDailyChallengeReminderNotification(row.user_id, row.current_streak);
      if (created) summary.usersNotified++;
    }
  } catch (err) {
    summary.errors.push(String(err));
  }

  return NextResponse.json(summary);
}
