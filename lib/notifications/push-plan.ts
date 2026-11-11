/**
 * Pure push planner: given one user's pending rows and today's pushes, decides whether to send one
 * combined push now or hold (quiet hours, daily cap, expiry). No I/O; the dispatch cron does the sending.
 */
import { isValidTimeZone } from '@/lib/dates/clock';

export type PushKind = 'user_alert' | 'portfolio_open' | 'portfolio_recap' | 'price_alerts' | 'upcoming_earnings'
  | 'dividend_reminder' | 'weekly_pick' | 'daily_challenge_reminder' | 'new_course' | 'saved_screen' | 'earnings_recap'
  | 'economic_events';

/**
 * Highest priority first: the lead row supplies the push title and URL.
 * saved_screen (Pro new-match alert, once a weekday per screen) sits under the
 * held/watched-stock kinds and above the ones nobody set up by hand. It counts
 * toward the daily cap: it is a discovery, not about money already in.
 */
export const PUSH_PRIORITY: PushKind[] = [
  // earnings_recap (Pro, a held or watched stock's results) leads the capped kinds.
  // economic_events is only the result of a release the user follows (CPI, jobs, Fed...), never the morning heads-up.
  'user_alert', 'portfolio_recap', 'portfolio_open', 'earnings_recap', 'price_alerts', 'economic_events', 'upcoming_earnings',
  'saved_screen', 'dividend_reminder', 'weekly_pick', 'daily_challenge_reminder', 'new_course',
];

export interface PendingPushRow {
  id: string; push_kind: PushKind; title: string; message: string;
  href: string | null; created_at: string; is_read: boolean;
}
export interface PushedRow { pushed_at: string; push_kind: PushKind }
export type PushPlan =
  | { action: 'send'; rowIds: string[]; title: string; body: string; url: string }
  | { action: 'hold'; reason: 'quiet' | 'cap' | 'nothing' };

const HOUR_MS = 3_600_000;
const DAILY_CAP = 3;
/** Pushes the user asked for by name (their own alerts, the open and close moves): never counted toward the cap, never held by it. */
const UNCAPPED = new Set<PushKind>(['user_alert', 'portfolio_open', 'portfolio_recap']);
/** 23:00, not 22:00: the US close is 22:00 in Oslo all year, and the close push is the one people wait for. */
const QUIET_START = 23;

export function safeTimeZone(tz: string | null | undefined): string {
  return tz && isValidTimeZone(tz) ? tz : 'UTC';
}

/** Local calendar date (YYYY-MM-DD) and hour (0-23) of an instant. */
function localParts(d: Date, tz: string): { date: string; hour: number } {
  const p: Record<string, string> = {};
  for (const x of new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit',
  }).formatToParts(d)) p[x.type] = x.value;
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) };
}

export function isQuietHour(now: Date, tz: string): boolean {
  const { hour } = localParts(now, tz);
  return hour >= QUIET_START || hour < 8;
}

export function isExpired(row: Pick<PendingPushRow, 'push_kind' | 'created_at'>, now: Date): boolean {
  const created = new Date(row.created_at);
  if (row.push_kind === 'daily_challenge_reminder') {
    // Expires at the first instant whose New York date is later than the creation date.
    return localParts(now, 'America/New_York').date > localParts(created, 'America/New_York').date;
  }
  // "At the open" is stale by the afternoon, so it does not wait out a night of quiet hours.
  const ttl = row.push_kind === 'portfolio_open' ? 6 : row.push_kind === 'user_alert' ? 12 : 20;
  return now.getTime() - created.getTime() > ttl * HOUR_MS;
}

/** Pushes already made on the user's local day. Rows sharing a `pushed_at` are one push; pushes made only of uncapped kinds don't count. */
export function pushesTodayCount(pushed: PushedRow[], now: Date, tz: string): number {
  const today = localParts(now, tz).date;
  const counted = new Set<string>();
  for (const r of pushed) {
    if (!UNCAPPED.has(r.push_kind) && localParts(new Date(r.pushed_at), tz).date === today) counted.add(r.pushed_at);
  }
  return counted.size;
}

export function withPushParams(href: string, id: string): string {
  return `${href}${href.includes('?') ? '&' : '?'}src=push&n=${id}`;
}

export function planUserPush(input: {
  pending: PendingPushRow[]; pushed: PushedRow[]; timeZone: string | null; now: Date;
}): PushPlan {
  const { now } = input;
  const tz = safeTimeZone(input.timeZone);
  let rows = input.pending.filter((r) => !r.is_read && !isExpired(r, now));
  if (rows.length === 0) return { action: 'hold', reason: 'nothing' };
  if (isQuietHour(now, tz)) return { action: 'hold', reason: 'quiet' };
  // At the cap only the uncapped kinds still go out.
  if (pushesTodayCount(input.pushed, now, tz) >= DAILY_CAP) {
    rows = rows.filter((r) => UNCAPPED.has(r.push_kind));
    if (rows.length === 0) return { action: 'hold', reason: 'cap' };
  }
  rows.sort((a, b) => PUSH_PRIORITY.indexOf(a.push_kind) - PUSH_PRIORITY.indexOf(b.push_kind));
  const [lead] = rows;
  if (rows.length === 1) {
    return { action: 'send', rowIds: [lead.id], title: lead.title, body: lead.message, url: withPushParams(lead.href ?? '/notifications', lead.id) };
  }
  const more = rows.length - 1;
  return {
    action: 'send',
    rowIds: rows.map((r) => r.id),
    title: lead.title,
    body: `Plus ${more} more update${more === 1 ? '' : 's'}`,
    url: withPushParams('/notifications', lead.id),
  };
}
