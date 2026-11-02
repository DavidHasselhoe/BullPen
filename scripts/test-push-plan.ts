/**
 * The push planner holds through quiet hours, caps at 3 a day, expires stale rows and combines the rest.
 * Run: npm run test-push-plan
 */
import assert from 'node:assert/strict';
import {
  safeTimeZone, isQuietHour, isExpired, pushesTodayCount, withPushParams, planUserPush,
  type PendingPushRow, type PushKind,
} from '../lib/notifications/push-plan';

assert.equal(safeTimeZone('Not/AZone'), 'UTC');
assert.equal(safeTimeZone(null), 'UTC');
assert.equal(safeTimeZone('Europe/Oslo'), 'Europe/Oslo');

assert.equal(isQuietHour(new Date('2026-10-30T20:59:00Z'), 'Europe/Oslo'), false);
assert.equal(isQuietHour(new Date('2026-10-30T21:00:00Z'), 'Europe/Oslo'), true);
assert.equal(isQuietHour(new Date('2026-10-30T07:00:00Z'), 'Europe/Oslo'), false);
// The days clocks go forward and back
assert.equal(isQuietHour(new Date('2026-03-29T06:30:00Z'), 'Europe/Oslo'), false);
assert.equal(isQuietHour(new Date('2026-11-01T12:30:00Z'), 'America/New_York'), true);
assert.equal(isQuietHour(new Date('2026-11-01T13:00:00Z'), 'America/New_York'), false);

const now = new Date('2026-10-30T12:00:00Z');
const ago = (h: number, m: number) => new Date(now.getTime() - (h * 60 + m) * 60_000).toISOString();
assert.equal(isExpired({ push_kind: 'user_alert', created_at: ago(11, 59) }, now), false);
assert.equal(isExpired({ push_kind: 'user_alert', created_at: ago(12, 1) }, now), true);
assert.equal(isExpired({ push_kind: 'weekly_pick', created_at: ago(19, 59) }, now), false);
assert.equal(isExpired({ push_kind: 'weekly_pick', created_at: ago(20, 1) }, now), true);
const challenge = { push_kind: 'daily_challenge_reminder' as const, created_at: '2026-10-30T01:00:00Z' };
assert.equal(isExpired(challenge, new Date('2026-10-30T03:59:00Z')), false);
assert.equal(isExpired(challenge, new Date('2026-10-30T04:01:00Z')), true);

const NY = 'America/New_York';
const p = (pushed_at: string, push_kind: PushKind) => ({ pushed_at, push_kind });
assert.equal(pushesTodayCount([p('2026-10-30T10:00:00Z', 'new_course'), p('2026-10-30T10:00:00Z', 'weekly_pick'), p('2026-10-30T10:00:00Z', 'price_alerts')], now, NY), 1);
assert.equal(pushesTodayCount([p('2026-10-30T10:00:00Z', 'user_alert')], now, NY), 0);
assert.equal(pushesTodayCount([p('2026-10-29T10:00:00Z', 'new_course')], now, NY), 0);

assert.equal(withPushParams('/stock/AAPL', 'x'), '/stock/AAPL?src=push&n=x');
assert.equal(withPushParams('/holdings?riskAnalysisId=1', 'x'), '/holdings?riskAnalysisId=1&src=push&n=x');

const row = (id: string, push_kind: PushKind, extra: Partial<PendingPushRow> = {}): PendingPushRow => ({
  id, push_kind, title: `t-${id}`, message: `m-${id}`, href: `/h/${id}`, created_at: ago(1, 0), is_read: false, ...extra,
});
const plan = (pending: PendingPushRow[], pushed = [] as ReturnType<typeof p>[], at = now) =>
  planUserPush({ pending, pushed, timeZone: NY, now: at });

assert.deepEqual(plan([]), { action: 'hold', reason: 'nothing' });
assert.deepEqual(plan([row('a', 'new_course', { is_read: true })]), { action: 'hold', reason: 'nothing' });
assert.deepEqual(plan([row('a', 'new_course', { created_at: '2026-10-30T02:00:00Z' })], [], new Date('2026-10-30T03:00:00Z')), { action: 'hold', reason: 'quiet' });

assert.deepEqual(plan([row('a', 'new_course')]), { action: 'send', rowIds: ['a'], title: 't-a', body: 'm-a', url: '/h/a?src=push&n=a' });
assert.equal((plan([row('a', 'new_course', { href: null })]) as { url: string }).url, '/notifications?src=push&n=a');

const three = plan([row('c', 'new_course'), row('r', 'portfolio_recap'), row('e', 'upcoming_earnings')]);
assert.deepEqual(three, { action: 'send', rowIds: ['r', 'e', 'c'], title: 't-r', body: 'Plus 2 more updates', url: withPushParams('/notifications', 'r') });
assert.equal((plan([row('c', 'new_course'), row('r', 'portfolio_recap')]) as { body: string }).body, 'Plus 1 more update');

const capped = [p('2026-10-30T05:00:00Z', 'new_course'), p('2026-10-30T08:00:00Z', 'new_course'), p('2026-10-30T11:00:00Z', 'new_course')];
const onlyAlert = plan([row('w', 'weekly_pick'), row('u', 'user_alert')], capped);
assert.equal(onlyAlert.action, 'send');
assert.deepEqual((onlyAlert as { rowIds: string[] }).rowIds, ['u']);
assert.deepEqual(plan([row('w', 'weekly_pick')], capped), { action: 'hold', reason: 'cap' });

assert.deepEqual(plan([row('w', 'weekly_pick', { created_at: ago(21, 0) })]), { action: 'hold', reason: 'nothing' });
const dropped = plan([row('w', 'weekly_pick', { created_at: ago(21, 0) }), row('c', 'new_course')]);
assert.deepEqual((dropped as { rowIds: string[] }).rowIds, ['c']);

console.log('test-push-plan: ok');
