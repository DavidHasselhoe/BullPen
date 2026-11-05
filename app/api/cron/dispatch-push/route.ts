/**
 * Web push dispatcher
 * GET /api/cron/dispatch-push
 *
 * QStash, every 15 minutes. For users with a push subscription, turns their unread, unemailed
 * pushable notifications into one combined push (planUserPush: quiet hours, daily cap, expiry)
 * and sends it to each of their devices. No subscribers = one read, no other queries.
 * No TwelveData credits. See lib/notifications/push-plan.ts.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withCronReport } from '@/lib/cron/report';
import { logSecurityEvent } from '@/lib/security/security-events';
import { createServerClient } from '@/lib/supabase/client';
import { isExpired, planUserPush, type PendingPushRow, type PushedRow } from '@/lib/notifications/push-plan';
import { notificationHref } from '@/lib/notifications/notification-href';
import { sendPush, type StoredSubscription } from '@/lib/notifications/push-send';

export const maxDuration = 60;

const HOUR_MS = 3_600_000;

type PendingDb = Omit<PendingPushRow, 'href'> & { user_id: string; type: string; entity_type: string | null; entity_id: string | null };
type SubDb = StoredSubscription & { user_id: string; time_zone: string | null };

function groupBy<T>(items: T[], key: (t: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const i of items) {
    const k = key(i);
    m.set(k, [...(m.get(k) ?? []), i]);
  }
  return m;
}

async function handleGET(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    logSecurityEvent('cron_secret_mismatch', { path: '/api/cron/dispatch-push' });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const stats = { users: 0, pushes: 0, rows: 0, held_quiet: 0, capped: 0, expired: 0, gone: 0, failed: 0, errors: [] as string[] };
  // Reaches cron health: withCronReport reports errors_count and errors_sample from this array.
  const noteError = (msg: string) => {
    console.error('[dispatch-push]', msg);
    if (stats.errors.length < 10) stats.errors.push(msg);
  };
  const supabase = createServerClient();
  const now = new Date();

  // Newest subscription first, so its time zone is the user's.
  const { data: subData, error: subErr } = await supabase
    .from('push_subscriptions')
    .select('id, user_id, endpoint, p256dh, auth, time_zone')
    .order('created_at', { ascending: false });
  if (subErr) throw new Error(`push_subscriptions: ${subErr.message}`);
  const subsByUser = groupBy((subData ?? []) as SubDb[], (s) => s.user_id);
  if (subsByUser.size === 0) return NextResponse.json(stats);

  // ponytail: PostgREST caps an unbounded select at 1000 rows; a backlog past that waits for the next run
  const { data: pendingData, error: pendErr } = await supabase
    .from('notifications')
    .select('id, user_id, type, entity_type, entity_id, push_kind, title, message, created_at, is_read')
    .not('push_kind', 'is', null)
    .is('pushed_at', null)
    .is('emailed_at', null) // first channel wins: a row the morning email carried is never pushed
    .eq('is_read', false)
    .gt('created_at', new Date(now.getTime() - 24 * HOUR_MS).toISOString())
    .in('user_id', [...subsByUser.keys()])
    .limit(1000);
  if (pendErr) throw new Error(`notifications: ${pendErr.message}`);

  const live: PendingDb[] = [];
  for (const r of (pendingData ?? []) as PendingDb[]) {
    if (isExpired(r, now)) stats.expired++;
    else live.push(r);
  }
  const pendingByUser = groupBy(live, (r) => r.user_id);
  if (pendingByUser.size === 0) return NextResponse.json(stats);
  const activeIds = [...pendingByUser.keys()];

  const [{ data: pushedData, error: pushedErr }, { data: userData, error: userErr }] = await Promise.all([
    supabase.from('notifications').select('user_id, pushed_at, push_kind')
      .in('user_id', activeIds).gt('pushed_at', new Date(now.getTime() - 30 * HOUR_MS).toISOString()),
    supabase.from('users').select('id, settings').in('id', activeIds),
  ]);
  if (pushedErr) throw new Error(`notifications pushed: ${pushedErr.message}`);
  if (userErr) throw new Error(`users: ${userErr.message}`);

  const pushedByUser = groupBy((pushedData ?? []) as (PushedRow & { user_id: string })[], (p) => p.user_id);
  const prefsByUser = new Map<string, Record<string, boolean>>();
  for (const u of (userData ?? []) as { id: string; settings: { notifications?: Record<string, boolean> } | null }[]) {
    prefsByUser.set(u.id, u.settings?.notifications ?? {});
  }

  for (const userId of activeIds) {
    const prefs = prefsByUser.get(userId) ?? {};
    if (prefs.push_alerts === false) continue;
    const userSubs = subsByUser.get(userId) ?? [];
    const plan = planUserPush({
      pending: (pendingByUser.get(userId) ?? [])
        .filter((r) => r.push_kind === 'user_alert' || prefs[r.push_kind] !== false)
        .map((r) => ({ ...r, href: notificationHref(r as Parameters<typeof notificationHref>[0]) })),
      pushed: pushedByUser.get(userId) ?? [],
      timeZone: userSubs[0]?.time_zone ?? null,
      now,
    });
    if (plan.action === 'hold') {
      if (plan.reason === 'quiet') stats.held_quiet++;
      else if (plan.reason === 'cap') stats.capped++;
      continue;
    }

    // Claim first: a row stamped here can never be pushed twice, and counts toward the daily cap
    // even if a later write fails. Nothing is sent when the claim fails.
    const stamp = now.toISOString();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any;
    const { data: claimed, error: claimErr } = await db.from('notifications').update({ pushed_at: stamp })
      .in('id', plan.rowIds).is('pushed_at', null).select('id');
    if (claimErr) {
      noteError(`claim ${userId}: ${claimErr.message}`);
      continue;
    }
    // An overlapping run (QStash retry) claimed some or all rows first: it sends them, this run hands back its share.
    if ((claimed ?? []).length !== plan.rowIds.length) {
      if ((claimed ?? []).length > 0) {
        const { error } = await db.from('notifications').update({ pushed_at: null })
          .in('id', (claimed as { id: string }[]).map((c) => c.id)).eq('pushed_at', stamp);
        if (error) noteError(`revert partial claim ${userId}: ${error.message}`);
      }
      continue;
    }

    const payload = { title: plan.title, body: plan.body, url: plan.url, tag: plan.rowIds[0] };
    const sentIds: string[] = [];
    const goneIds: string[] = [];
    for (const sub of userSubs) {
      const result = await sendPush(sub, payload);
      if (result === 'sent') sentIds.push(sub.id);
      else if (result === 'gone') goneIds.push(sub.id);
      else {
        // Into errors, not just a count: errors_count is what the cron alert fires on.
        stats.failed++;
        noteError(result.error);
      }
    }
    if (goneIds.length > 0) {
      const { error } = await supabase.from('push_subscriptions').delete().in('id', goneIds);
      if (error) noteError(`delete gone subscriptions: ${error.message}`);
      stats.gone += goneIds.length;
    }
    if (sentIds.length === 0) {
      // Nothing reached a device: hand the rows back. If this fails they stay in the bell only, the safe direction.
      const { error } = await db.from('notifications').update({ pushed_at: null }).in('id', plan.rowIds).eq('pushed_at', stamp);
      if (error) noteError(`revert ${userId}: ${error.message}`);
      continue;
    }

    const { error: sentErr } = await db.from('push_subscriptions').update({ last_sent_at: stamp }).in('id', sentIds);
    if (sentErr) noteError(`last_sent_at: ${sentErr.message}`);
    stats.users++;
    stats.pushes++;
    stats.rows += plan.rowIds.length;
  }

  return NextResponse.json(stats);
}

export const GET = withCronReport('dispatch-push', handleGET);
