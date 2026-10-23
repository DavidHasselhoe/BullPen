/**
 * Smart notification creator helpers.
 *
 * Centralises notification wording and severity logic so cron jobs stay thin.
 * All functions call createNotification() which handles DB dedup.
 * "Daily dedup" — each function checks if a notification for the same
 * user + entity was already created in the past 12 hours before calling
 * createNotification, preventing duplicate daily-digest spam.
 */

import { createNotification, type CreateNotificationInput, type NotifMsg, type I18nParams } from './notifications-db';
import { createServerClient } from '@/lib/supabase/client';
import type { NewTrade } from '@/lib/congress/ingest-trades';
import { formatAmountRange, tradeDirection } from '@/lib/congress/types';
import { isPro, tierFromUser } from '@/lib/billing/tier';
import { ECONOMIC_KINDS, type EconomicKind } from '@/lib/market-data/economic-kinds';
import { CALENDAR_PREFS_KEY, parseCalendarPrefs } from '@/lib/market-data/calendar-prefs';
import { indexChangeWeekOf, type IndexChangeEvent } from '@/lib/market-data/index-events';
import { TRACKERS, type IndexId } from '@/lib/market-data/index-membership';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PriceMover {
  symbol: string;
  companyName: string;
  changePercent: number;
  price: number;
  change: number;
}

export interface EarningsItem {
  symbol: string;
  companyName?: string;
  date: string; // YYYY-MM-DD
  /** Held (open position) rather than only on a watchlist. */
  owned?: boolean;
}

// title and message are written once, in English, as the fallback for rows
// read by older builds. params carries the same text as i18n keys
// (navigation `notif*`), which the panel words in the reader's language
// (NotificationItem renderMsg). Values that are data, not wording (tickers,
// prices, fund and course names, model-written headlines), pass through as is.
const msg = (key: string, vars?: NotifMsg['vars']): NotifMsg => (vars ? { key, vars } : { key });
const i18n = (title: NotifMsg, message?: NotifMsg): I18nParams => (message ? { kind: 'i18n', title, message } : { kind: 'i18n', title });
/** Up to five, then "N more", as the list values the panel formats. */
const capped = (items: string[]): Array<string | NotifMsg> =>
  items.length > 5 ? [...items.slice(0, 5), msg('notifEarningsMore', { n: items.length - 5 })] : items;

/** "Oct 21" from a YYYY-MM-DD market date, read in UTC so no zone moves it a day. */
function shortDate(ymd: string): string {
  return new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

// ─── Dedup helpers ────────────────────────────────────────────────────────────

/**
 * Returns true if a notification of the given type + entity_id already exists
 * for this user within the past 12 hours. Used to prevent duplicate daily alerts.
 */
async function alreadyNotifiedToday(
  userId: string,
  type: 'price_move' | 'earnings' | 'ai_insight' | 'market' | 'dividend' | 'academy' | 'health_score' | 'weekly_pick' | 'daily_brief',
  entityId: string
): Promise<boolean> {
  const supabase = createServerClient();
  const cutoff = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from('notifications')
    .select('id')
    .eq('user_id', userId)
    .eq('type', type)
    .eq('entity_id', entityId)
    .gte('created_at', cutoff)
    .limit(1)
    .maybeSingle();
  return !!data;
}

// ─── Price move notifications ─────────────────────────────────────────────────

/**
 * Create a notification for a single stock that moved significantly (≥5%).
 * Severity scales with magnitude: info (<7%), warning (7–10%), critical (>10%).
 */
export async function createPriceMoveNotification(
  userId: string,
  mover: PriceMover
): Promise<boolean> {
  const dedupeId = `${mover.symbol}:price_move`;
  if (await alreadyNotifiedToday(userId, 'price_move', dedupeId)) return false;

  const pct = mover.changePercent;
  const absPct = Math.abs(pct);
  const sign = pct > 0 ? '+' : '';

  const severity: 'info' | 'warning' | 'critical' =
    absPct >= 10 ? 'critical' : absPct >= 7 ? 'warning' : 'info';

  const name = mover.companyName || mover.symbol;
  const pctStr = `${sign}${pct.toFixed(1)}%`;
  const price = `$${mover.price.toFixed(2)}`;
  const change = `${sign}$${mover.change.toFixed(2)}`;
  const input: CreateNotificationInput = {
    user_id: userId,
    type: 'price_move',
    title: `${mover.symbol} moved ${pctStr} today`,
    message: `${name} closed at ${price} (${change})`,
    entity_type: 'stock',
    entity_id: dedupeId,
    severity,
    params: i18n(msg('notifPriceMoveTitle', { symbol: mover.symbol, pct: pctStr }), msg('notifPriceMoveMessage', { name, price, change })),
  };

  const result = await createNotification(input);
  return result.success;
}

/**
 * Create grouped notifications when 3+ tracked stocks moved significantly.
 * Gainers and losers are split into separate notifications so the direction
 * is always unambiguous. Returns true if at least one notification was created.
 */
export async function createPriceMoveDigestNotification(
  userId: string,
  movers: PriceMover[]
): Promise<boolean> {
  const gainers = movers.filter((m) => m.changePercent > 0)
    .sort((a, b) => b.changePercent - a.changePercent);
  const losers  = movers.filter((m) => m.changePercent <= 0)
    .sort((a, b) => a.changePercent - b.changePercent);

  let created = false;

  if (gainers.length > 0) {
    const dedupeId = 'portfolio:price_digest_gain';
    if (!(await alreadyNotifiedToday(userId, 'price_move', dedupeId))) {
      const lines = gainers.map((m) => `${m.symbol} +${m.changePercent.toFixed(1)}%`);
      const suffix = gainers.length > 5 ? ` +${gainers.length - 5} more` : '';
      const result = await createNotification({
        user_id: userId,
        type: 'price_move',
        title: `${gainers.length} of your stocks ${gainers.length === 1 ? 'is' : 'are'} up today (${lines[0]})`,
        message: lines.slice(0, 5).join(', ') + suffix,
        entity_type: 'portfolio',
        entity_id: dedupeId,
        severity: 'info',
        params: i18n(msg('notifDigestUp', { count: gainers.length, top: lines[0] }), msg('notifList', { items: capped(lines) })),
      });
      if (result.success) created = true;
    }
  }

  if (losers.length > 0) {
    const dedupeId = 'portfolio:price_digest_loss';
    if (!(await alreadyNotifiedToday(userId, 'price_move', dedupeId))) {
      const lines = losers.map((m) => `${m.symbol} ${m.changePercent.toFixed(1)}%`);
      const suffix = losers.length > 5 ? ` +${losers.length - 5} more` : '';
      const result = await createNotification({
        user_id: userId,
        type: 'price_move',
        title: `${losers.length} of your stocks ${losers.length === 1 ? 'is' : 'are'} down today (${lines[0]})`,
        message: lines.slice(0, 5).join(', ') + suffix,
        entity_type: 'portfolio',
        entity_id: dedupeId,
        severity: losers.some((m) => Math.abs(m.changePercent) >= 10) ? 'warning' : 'info',
        params: i18n(msg('notifDigestDown', { count: losers.length, top: lines[0] }), msg('notifList', { items: capped(lines) })),
      });
      if (result.success) created = true;
    }
  }

  return created;
}

// ─── Daily portfolio recap ────────────────────────────────────────────────────

export interface PortfolioRecap {
  /** Portfolio-weighted day change (%). */
  dayPct: number;
  /** Largest day contributor by dollar move. */
  topSymbol: string;
  topPct: number;
  holdingsCount: number;
}

/**
 * A once-per-trading-day pulse of the user's actual holdings:
 * "Your portfolio +1.2% today — 8 holdings · NVDA +4.1% led".
 * Rendered as a portfolio price_move so the existing logo/direction UI applies.
 */
export async function createPortfolioRecapNotification(
  userId: string,
  recap: PortfolioRecap
): Promise<boolean> {
  const todayStr = new Date().toISOString().slice(0, 10);
  const dedupeId = `portfolio:daily_recap:${todayStr}`;
  if (await alreadyNotifiedToday(userId, 'price_move', dedupeId)) return false;

  const sign = recap.dayPct >= 0 ? '+' : '';
  const topSign = recap.topPct >= 0 ? '+' : '';
  const pct = `${sign}${recap.dayPct.toFixed(2)}%`;
  const topPct = `${topSign}${recap.topPct.toFixed(1)}%`;
  const input: CreateNotificationInput = {
    user_id: userId,
    type: 'price_move',
    title: `Your portfolio ${pct} today`,
    message: `${recap.holdingsCount} holding${recap.holdingsCount === 1 ? '' : 's'} · ${recap.topSymbol} ${topPct} led`,
    entity_type: 'portfolio',
    entity_id: dedupeId,
    severity: 'info',
    params: i18n(msg('notifRecapTitle', { pct }), msg('notifRecapMessage', { count: recap.holdingsCount, symbol: recap.topSymbol, pct: topPct })),
  };

  const result = await createNotification(input);
  return result.success;
}

// ─── User-defined alert notifications ────────────────────────────────────────

import { describeAlert, describeAlertKey, type UserAlert } from '@/types/alerts';
import { OPEN_POSITION_FILTER } from '@/lib/holdings/open-position';

/**
 * Create a notification when a user-defined alert is triggered by the
 * `/api/cron/check-user-alerts` job. 24h dedup is enforced at the cron layer
 * via the alert's `last_triggered_at`; the 12h check here is a belt-and-
 * suspenders extra layer.
 */
export async function createUserAlertNotification(
  userId: string,
  alert: Pick<UserAlert, 'id' | 'symbol' | 'companyName' | 'alertType' | 'threshold'>,
  currentPrice: number
): Promise<boolean> {
  const dedupeId = `user_alert:${alert.id}`;
  if (await alreadyNotifiedToday(userId, 'price_move', dedupeId)) return false;

  const name = alert.companyName || alert.symbol;
  const priceStr = `$${currentPrice.toFixed(2)}`;
  const described = describeAlertKey(alert, 'en-US');

  const input: CreateNotificationInput = {
    user_id: userId,
    type: 'price_move',
    title: `${alert.symbol} hit ${priceStr}`,
    message: `Your "${describeAlert(alert)}" alert on ${name} was triggered.`,
    entity_type: 'user_alert',
    entity_id: dedupeId,
    severity: 'info',
    params: i18n(
      msg('notifAlertHitTitle', { symbol: alert.symbol, price: priceStr }),
      msg('notifAlertHitMessage', { alert: [msg(`alerts:${described.key}`, described.vars)], name }),
    ),
  };

  const result = await createNotification(input);
  return result.success;
}

// ─── Health score change notifications ───────────────────────────────────────

export interface HealthScoreChange {
  symbol: string;
  companyName?: string;
  oldGrade: string;
  newGrade: string;
  oldScore: number;
  newScore: number;
}

/**
 * Create a notification when a held/watched stock's BullPen health score
 * crosses a letter grade (e.g. B → C). Deliberately gated on grade, not raw
 * score, so day-to-day point wobble doesn't spam users — this only fires on
 * a change worth noticing.
 */
export async function createHealthScoreChangeNotification(
  userId: string,
  change: HealthScoreChange
): Promise<boolean> {
  const dedupeId = `${change.symbol}:health_score`;
  if (await alreadyNotifiedToday(userId, 'health_score', dedupeId)) return false;

  const improved = change.newScore >= change.oldScore;
  const name = change.companyName || change.symbol;

  const input: CreateNotificationInput = {
    user_id: userId,
    type: 'health_score',
    title: `${change.symbol} health score ${improved ? 'improved' : 'dropped'} to ${change.newGrade}`,
    message: `${name} moved from ${change.oldGrade} (${change.oldScore}) to ${change.newGrade} (${change.newScore}).`,
    entity_type: 'stock',
    entity_id: dedupeId,
    severity: improved ? 'info' : 'warning',
    params: i18n(
      msg(improved ? 'notifHealthImproved' : 'notifHealthDropped', { symbol: change.symbol, grade: change.newGrade }),
      msg('notifHealthMessage', { name, oldGrade: change.oldGrade, oldScore: change.oldScore, newGrade: change.newGrade, newScore: change.newScore }),
    ),
  };

  const result = await createNotification(input);
  return result.success;
}

/**
 * Fan-out for a batch of grade changes detected in one screener-stats refresh
 * run (see lib/market-data/screener-stats.ts). Finds every user who holds or
 * watches an affected ticker with alerts enabled, filters to those who have
 * health_score_change notifications on, and creates one notification per
 * user per changed ticker they track. Fire-and-forget from the caller — a
 * failure here must never fail the screener refresh itself.
 */
export async function notifyHealthScoreChanges(changes: HealthScoreChange[]): Promise<void> {
  if (changes.length === 0) return;
  const supabase = createServerClient();
  const symbols = changes.map((c) => c.symbol);

  const [watchlistRes, holdingsRes] = await Promise.all([
    supabase.from('user_watchlist').select('user_id, symbol, company_name').in('symbol', symbols).eq('alerts_enabled', true) as unknown as
      Promise<{ data: Array<{ user_id: string; symbol: string; company_name: string | null }> | null }>,
    supabase.from('user_holdings').select('user_id, symbol, company_name').in('symbol', symbols).eq('alerts_enabled', true).or(OPEN_POSITION_FILTER) as unknown as
      Promise<{ data: Array<{ user_id: string; symbol: string; company_name: string | null }> | null }>,
  ]);

  const userSymbols = new Map<string, Set<string>>();
  const companyNames = new Map<string, string>();
  for (const row of [...(watchlistRes.data ?? []), ...(holdingsRes.data ?? [])]) {
    if (!userSymbols.has(row.user_id)) userSymbols.set(row.user_id, new Set());
    userSymbols.get(row.user_id)!.add(row.symbol);
    if (row.company_name && !companyNames.has(row.symbol)) companyNames.set(row.symbol, row.company_name);
  }
  if (userSymbols.size === 0) return;

  const { data: users } = await supabase
    .from('users')
    .select('id, settings')
    .in('id', [...userSymbols.keys()]) as unknown as
    { data: Array<{ id: string; settings: { notifications?: Record<string, boolean> } | null }> | null };
  const enabledUserIds = new Set(
    (users ?? [])
      .filter((u) => u.settings?.notifications?.health_score_change !== false)
      .map((u) => u.id)
  );

  const changeMap = new Map(changes.map((c) => [c.symbol, c]));
  for (const [userId, symbolSet] of userSymbols) {
    if (!enabledUserIds.has(userId)) continue;
    for (const symbol of symbolSet) {
      const change = changeMap.get(symbol);
      if (!change) continue;
      await createHealthScoreChangeNotification(userId, { ...change, companyName: companyNames.get(symbol) ?? change.companyName });
    }
  }
}

// ─── Weekly Pick ready ────────────────────────────────────────────────────────

/**
 * Create a notification that Bull's Weekly Pick has been published. The pick
 * itself is global content (one per week, not per-user) — the caller fans
 * this out to every eligible user after generation. Ticker/headline/entry are
 * free-tier content (only the thesis is Pro-gated), so this isn't Pro-only.
 */
export async function createWeeklyPickNotification(
  userId: string,
  pick: { symbol: string; headline: string; pickDate: string }
): Promise<boolean> {
  const dedupeId = `weekly_pick:${pick.pickDate}`;
  if (await alreadyNotifiedToday(userId, 'weekly_pick', dedupeId)) return false;

  const result = await createNotification({
    user_id: userId,
    type: 'weekly_pick',
    title: `Bull's Weekly Pick: $${pick.symbol}`,
    message: pick.headline,
    entity_type: 'stock',
    entity_id: dedupeId,
    severity: 'info',
    params: i18n(msg('notifWeeklyPickTitle', { symbol: pick.symbol })),
  });
  return result.success;
}

// ─── Daily Brief ready ────────────────────────────────────────────────────────

/**
 * Create a notification that today's Daily Brief is ready. The brief itself
 * is global content — the caller fans this out to Pro users (the only users
 * who can actually read it) after generation.
 */
export async function createDailyBriefReadyNotification(
  userId: string,
  brief: { title: string; publishedDate: string }
): Promise<boolean> {
  const dedupeId = `daily_brief:${brief.publishedDate}`;
  if (await alreadyNotifiedToday(userId, 'daily_brief', dedupeId)) return false;

  const result = await createNotification({
    user_id: userId,
    type: 'daily_brief',
    title: 'Your Daily Brief is ready',
    message: brief.title,
    entity_type: 'market',
    entity_id: dedupeId,
    severity: 'info',
    params: i18n(msg('notifDailyBriefTitle')),
  });
  return result.success;
}

// ─── Ex-dividend reminder notifications ──────────────────────────────────────

export interface DividendItem {
  symbol: string;
  companyName?: string;
  exDate: string; // YYYY-MM-DD
}

/**
 * Create a notification when tracked stocks are about to go ex-dividend.
 * Groups all tickers into a single notification per user per day, same
 * shape as the earnings-upcoming digest.
 */
export async function createDividendReminderNotification(
  userId: string,
  items: DividendItem[]
): Promise<boolean> {
  const todayStr = new Date().toISOString().slice(0, 10);
  const dedupeId = `portfolio:dividend_reminder:${todayStr}`;
  if (await alreadyNotifiedToday(userId, 'dividend', dedupeId)) return false;

  const count = items.length;
  const tickerList = items
    .slice(0, 5)
    .map((d) => d.symbol)
    .join(', ');
  const suffix = count > 5 ? ` +${count - 5} more` : '';

  const input: CreateNotificationInput = {
    user_id: userId,
    type: 'dividend',
    // One stock: name it and the date, and say what the date means. The card's
    // link reads the ticker from the start of the title.
    title: count === 1
      ? `${items[0].symbol} goes ex-dividend ${shortDate(items[0].exDate)}`
      // The cron asks for one day, so every item shares that ex-date.
      : `${count} of your stocks go ex-dividend ${shortDate(items[0].exDate)}`,
    message: count === 1
      ? `Shares bought before ${shortDate(items[0].exDate)} get the next payout.`
      : `${tickerList}${suffix}. Shares bought before ${shortDate(items[0].exDate)} get the next payout.`,
    entity_type: 'portfolio',
    entity_id: dedupeId,
    severity: 'info',
    params: count === 1
      ? i18n(
        msg('notifDividendOneTitle', { symbol: items[0].symbol, date: { date: items[0].exDate } }),
        msg('notifDividendOneMessage', { date: { date: items[0].exDate } }),
      )
      : i18n(msg('notifDividendManyTitle', { count }), msg('notifList', { items: capped(items.map((d) => d.symbol)) })),
  };

  const result = await createNotification(input);
  return result.success;
}

// ─── Academy daily challenge streak reminder ─────────────────────────────────

/**
 * Create a reminder for a user whose Academy streak is active but who hasn't
 * done anything in Academy yet today (lesson or daily challenge) — a nudge to
 * protect the streak before the ET day ends. Targeting (active streak +
 * no activity today) happens in the cron; this only handles the notification
 * itself. Fires at most once per ET day per user via the standard 12h dedup.
 *
 * Deliberately doesn't bake the streak count into the title: notification
 * text is written once at creation time and never re-rendered, but the
 * streak itself can change (reset to 1) if the user acts later that same
 * evening or the next day before reading it — leaving a stale number here
 * that contradicts whatever /academy shows live at read time.
 */
export async function createDailyChallengeReminderNotification(
  userId: string
): Promise<boolean> {
  const todayStr = new Date().toISOString().slice(0, 10);
  const dedupeId = `academy:streak_reminder:${todayStr}`;
  if (await alreadyNotifiedToday(userId, 'academy', dedupeId)) return false;

  const result = await createNotification({
    user_id: userId,
    type: 'academy',
    title: 'Keep your streak alive',
    message: "Today's Academy challenge is still waiting. It takes about a minute.",
    entity_type: 'market',
    entity_id: dedupeId,
    severity: 'info',
    params: i18n(msg('notifStreakTitle'), msg('notifStreakMessage')),
  });
  return result.success;
}

/**
 * Tells everyone who has started an Academy course that a new one is live.
 * Called once when an admin approves a draft. Switched off by
 * settings.notifications.new_course === false. Idempotent on entity_id
 * "academy:new_course:<slug>", which the card turns into a link to the course.
 */
export async function notifyNewAcademyCourse(course: { slug: string; title: string; requiresPro: boolean }): Promise<number> {
  const supabase = createServerClient();
  const entityId = `academy:new_course:${course.slug}`;

  // Paginated: PostgREST silently caps an unbounded select at 1000.
  const learners = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('academy_user_course_progress')
      .select('user_id')
      .order('user_id')
      .range(from, from + 999);
    if (error) throw error;
    for (const r of data ?? []) learners.add(r.user_id as string);
    if (!data || data.length < 1000) break;
  }
  if (learners.size === 0) return 0;
  const userIds = [...learners];

  const [{ data: users, error: usersError }, { data: existing }] = await Promise.all([
    supabase.from('users').select('id, settings').in('id', userIds),
    supabase.from('notifications').select('user_id').eq('entity_id', entityId).in('user_id', userIds),
  ]);
  if (usersError) throw usersError;
  const skip = new Set((existing ?? []).map((n) => n.user_id as string));
  for (const u of (users ?? []) as Array<{ id: string; settings: { notifications?: Record<string, boolean> } | null }>) {
    if (u.settings?.notifications?.new_course === false) skip.add(u.id);
  }

  const rows = userIds.filter((id) => !skip.has(id)).map((user_id) => ({
    user_id,
    type: 'academy',
    title: `New course: ${course.title}`,
    message: course.requiresPro
      ? 'A new Pro course just opened in Academy.'
      : 'A new course just opened in Academy. Start the first lesson whenever you like.',
    entity_type: 'market',
    entity_id: entityId,
    severity: 'info',
    params: i18n(msg('notifNewCourseTitle', { title: course.title }), msg(course.requiresPro ? 'notifNewCoursePro' : 'notifNewCourseFree')),
  }));
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.from('notifications').insert(rows.slice(i, i + 500));
    if (error) throw error;
  }
  return rows.length;
}

// ─── Earnings upcoming notifications ─────────────────────────────────────────

/**
 * Create a notification when tracked stocks report earnings today.
 * Groups all tickers reporting today into a single notification per user per day.
 */
export async function createEarningsUpcomingNotification(
  userId: string,
  items: EarningsItem[]
): Promise<boolean> {
  const todayStr = new Date().toISOString().slice(0, 10);
  const dedupeId = `portfolio:earnings_today:${todayStr}`;
  if (await alreadyNotifiedToday(userId, 'earnings', dedupeId)) return false;

  const count = items.length;
  const owned = items.filter((e) => e.owned).map((e) => e.symbol);
  const watched = items.filter((e) => !e.owned).map((e) => e.symbol);
  const name = count === 1 ? (items[0].companyName ?? items[0].symbol) : undefined;

  // English fallback for builds that don't read params; the panel words it
  // from params in the reader's language (NotificationItem earningsTodayText).
  const list = (syms: string[]) => syms.slice(0, 5).join(', ') + (syms.length > 5 ? ` +${syms.length - 5} more` : '');
  const message = count === 1
    ? (owned.length ? `You own ${name}.` : `On your watchlist: ${name}.`)
    : [owned.length ? `You own ${list(owned)}.` : '', watched.length ? `On your watchlist: ${list(watched)}.` : ''].filter(Boolean).join(' ');
  const title = count === 1 ? `${items[0].symbol} reports earnings today`
    : !watched.length ? `${count} stocks you own report earnings today`
    : !owned.length ? `${count} stocks on your watchlist report earnings today`
    : `${count} of your stocks report earnings today`;

  const input: CreateNotificationInput = {
    user_id: userId,
    type: 'earnings',
    title,
    message,
    entity_type: 'portfolio',
    entity_id: dedupeId,
    severity: 'info',
    params: { kind: 'earnings_today', owned, watched, ...(name ? { name } : {}) },
  };

  const result = await createNotification(input);
  return result.success;
}

// ─── Institutional 13F filings ───────────────────────────────────────────────

export interface InstitutionFilingNotice {
  investorId: string;
  slug: string;
  displayName: string;
  /** Uniquely identifies the filing. Doubles as the dedupe key. */
  accessionNumber: string;
  periodOfReport: string;
  /** Already-templated summary of what moved, or null when nothing notable
   *  changed (or there was no prior quarter to compare against). */
  summary: string | null;
}

/** "2026-06-30" to "Q2 2026". */
function quarterLabel(iso: string): string {
  const [year, month] = iso.split('-').map(Number);
  if (!year || !month) return iso;
  return `Q${Math.floor((month - 1) / 3) + 1} ${year}`;
}

/**
 * Tells everyone following a fund that it filed new holdings.
 *
 * Structurally the same as notifyHealthScoreChanges: resolve the audience,
 * drop anyone who turned this notification type off, create one row each.
 * The difference is cadence — a 13F lands once a quarter per fund, so the
 * 12-hour alreadyNotifiedToday window every other creator relies on would not
 * protect anything here. The accession number does: it is unique per filing,
 * so re-running the weekly cron can never produce a second notification for a
 * filing already announced.
 */
export async function notifyInstitutionFilingChange(notice: InstitutionFilingNotice): Promise<number> {
  const supabase = createServerClient();

  const { data: follows } = (await supabase
    .from('user_institution_follows')
    .select('user_id')
    .eq('investor_id', notice.investorId)) as unknown as {
    data: Array<{ user_id: string }> | null;
  };

  const followerIds = (follows ?? []).map((f) => f.user_id);
  if (followerIds.length === 0) return 0;

  const { data: users } = (await supabase
    .from('users')
    .select('id, settings')
    .in('id', followerIds)) as unknown as {
    data: Array<{ id: string; settings: { notifications?: Record<string, boolean> } | null }> | null;
  };

  // Absent means enabled, matching every other notification preference.
  const enabled = (users ?? [])
    .filter((u) => u.settings?.notifications?.institution_filing !== false)
    .map((u) => u.id);
  if (enabled.length === 0) return 0;

  const entityId = `institution:${notice.slug}:${notice.accessionNumber}`;
  const quarter = quarterLabel(notice.periodOfReport);

  let sent = 0;
  for (const userId of enabled) {
    // Idempotent on the filing itself, not on a time window.
    const { data: existing } = await supabase
      .from('notifications')
      .select('id')
      .eq('user_id', userId)
      .eq('type', 'institution_filing')
      .eq('entity_id', entityId)
      .limit(1)
      .maybeSingle<{ id: string }>();
    if (existing) continue;

    const input: CreateNotificationInput = {
      user_id: userId,
      type: 'institution_filing',
      title: `${notice.displayName} filed ${quarter} holdings`,
      message: notice.summary ?? `See what changed in the ${quarter} portfolio.`,
      entity_type: 'institution',
      entity_id: entityId,
      severity: 'info',
      // The summary is templated English from the filing diff; only the fallback line is worded here.
      params: i18n(
        msg('notifFilingTitle', { fund: notice.displayName, quarter }),
        notice.summary ? undefined : msg('notifFilingNoSummary', { quarter }),
      ),
    };
    const result = await createNotification(input);
    if (result.success) sent++;
  }

  return sent;
}

// ─── Washington Trading ──────────────────────────────────────────────────────

export interface PoliticianTradesNotice {
  politicianId: string;
  slug: string;
  displayName: string;
  trades: NewTrade[];
}

/**
 * Tells everyone following a politician that new trades were disclosed.
 * Same shape as notifyInstitutionFilingChange. Only trades with a resolved
 * ticker are announced: the rest are treasuries and munis, noise in a
 * notification. Idempotent on the newest trade id, so a re-run of the refresh
 * cron can never announce the same batch twice.
 */
export async function notifyPoliticianTrades(notice: PoliticianTradesNotice): Promise<number> {
  const trades = notice.trades.filter((t) => t.symbol);
  if (trades.length === 0) return 0;
  const supabase = createServerClient();

  const { data: follows } = (await supabase
    .from('user_politician_follows')
    .select('user_id')
    .eq('politician_id', notice.politicianId)) as unknown as { data: Array<{ user_id: string }> | null };
  const followerIds = (follows ?? []).map((f) => f.user_id);
  if (followerIds.length === 0) return 0;

  const { data: users } = (await supabase
    .from('users')
    .select('id, settings')
    .in('id', followerIds)) as unknown as {
    data: Array<{ id: string; settings: { notifications?: Record<string, boolean> } | null }> | null;
  };
  const enabled = (users ?? [])
    .filter((u) => u.settings?.notifications?.politician_trades !== false)
    .map((u) => u.id);
  if (enabled.length === 0) return 0;

  const newest = Math.max(...trades.map((t) => t.dc_trade_id));
  const entityId = `politician:${notice.slug}:${newest}`;
  const shown = trades.slice(0, 3).map((t) => {
    const dir = tradeDirection(t.trade_type);
    const amount = formatAmountRange(t.amount_low, t.amount_high, t.amount_range);
    const verb = dir === 'buy' ? 'Bought' : dir === 'sell' ? 'Sold' : t.trade_type;
    return {
      text: `${verb} ${t.symbol} (${amount})`,
      msg: dir === 'buy' ? msg('notifPolBought', { symbol: t.symbol!, amount })
        : dir === 'sell' ? msg('notifPolSold', { symbol: t.symbol!, amount })
        : msg('notifPolOther', { type: t.trade_type, symbol: t.symbol!, amount }),
    };
  });
  const more = trades.length - shown.length;
  const message = shown.map((s) => s.text).join(', ') + (more > 0 ? ` and ${more} more.` : '.');
  const title = `${notice.displayName} disclosed ${trades.length} new trade${trades.length === 1 ? '' : 's'}`;
  const params = i18n(
    msg('notifPolTradesTitle', { name: notice.displayName, count: trades.length }),
    msg('notifPolTradesMessage', { items: [...shown.map((s) => s.msg), ...(more > 0 ? [msg('notifEarningsMore', { n: more })] : [])] }),
  );

  let sent = 0;
  for (const userId of enabled) {
    const { data: existing } = await supabase
      .from('notifications')
      .select('id')
      .eq('user_id', userId)
      .eq('type', 'politician_trade')
      .eq('entity_id', entityId)
      .limit(1)
      .maybeSingle<{ id: string }>();
    if (existing) continue;

    const result = await createNotification({
      user_id: userId,
      type: 'politician_trade',
      title,
      message,
      entity_type: 'politician',
      entity_id: entityId,
      severity: 'info',
      params,
    });
    if (result.success) sent++;
  }
  return sent;
}

/**
 * Pro: tells users when tracked politicians disclosed trades in stocks they
 * hold or watch, whether or not they follow those politicians. One summary
 * per user per refresh run, idempotent on the run's newest trade id.
 */
export async function notifyHoldersOfPoliticianTrades(
  batch: { displayName: string; trades: NewTrade[] }[],
): Promise<number> {
  // symbol -> who did what in it, as English text and as a worded message.
  const bySymbol = new Map<string, Array<{ text: string; msg: NotifMsg }>>();
  let newest = 0;
  for (const m of batch) {
    for (const t of m.trades) {
      if (!t.symbol) continue;
      newest = Math.max(newest, t.dc_trade_id);
      const dir = tradeDirection(t.trade_type);
      const text = `${m.displayName} ${dir === 'buy' ? 'bought' : dir === 'sell' ? 'sold' : t.trade_type.toLowerCase()}`;
      const lines = bySymbol.get(t.symbol) ?? [];
      if (lines.some((l) => l.text === text)) continue;
      bySymbol.set(t.symbol, [...lines, {
        text,
        msg: dir === 'buy' ? msg('notifPolActorBought', { name: m.displayName })
          : dir === 'sell' ? msg('notifPolActorSold', { name: m.displayName })
          : msg('notifPolActorOther', { name: m.displayName, type: t.trade_type.toLowerCase() }),
      }]);
    }
  }
  if (bySymbol.size === 0) return 0;
  const symbols = [...bySymbol.keys()];
  const supabase = createServerClient();

  const [held, watched] = await Promise.all([
    supabase.from('user_holdings').select('user_id, symbol').in('symbol', symbols).or(OPEN_POSITION_FILTER),
    supabase.from('user_watchlist').select('user_id, symbol').in('symbol', symbols),
  ]);
  const userSymbols = new Map<string, Set<string>>();
  for (const r of [...((held.data ?? []) as { user_id: string; symbol: string }[]), ...((watched.data ?? []) as { user_id: string; symbol: string }[])]) {
    userSymbols.set(r.user_id, (userSymbols.get(r.user_id) ?? new Set()).add(r.symbol.toUpperCase()));
  }
  if (userSymbols.size === 0) return 0;

  const { data: users } = (await supabase
    .from('users')
    .select('id, settings, account_tier, role, pro_bonus_until')
    .in('id', [...userSymbols.keys()])) as unknown as {
    data: Array<{ id: string; settings: { notifications?: Record<string, boolean> } | null; account_tier: number | null; role: string | null; pro_bonus_until: string | null }> | null;
  };

  const entityId = `politician-holdings:${newest}`;
  let sent = 0;
  for (const u of users ?? []) {
    if (!isPro(tierFromUser(u.account_tier, u.role, u.pro_bonus_until))) continue;
    if (u.settings?.notifications?.politician_trades_holdings === false) continue;
    const mine = [...(userSymbols.get(u.id) ?? [])].filter((s) => bySymbol.has(s));
    if (mine.length === 0) continue;

    const { data: existing } = await supabase
      .from('notifications').select('id')
      .eq('user_id', u.id).eq('type', 'politician_trade').eq('entity_id', entityId)
      .limit(1).maybeSingle<{ id: string }>();
    if (existing) continue;

    const top = mine.slice(0, 3);
    const parts = top.map((s) => `${s}: ${bySymbol.get(s)!.map((l) => l.text).join(', ')}`);
    const more = mine.length - parts.length;
    const result = await createNotification({
      user_id: u.id,
      type: 'politician_trade',
      title: `Politicians traded ${mine.length === 1 ? '1 of your stocks' : `${mine.length} of your stocks`}`,
      message: parts.join('. ') + (more > 0 ? `. And ${more} more.` : '.'),
      entity_type: 'politician',
      entity_id: entityId,
      severity: 'info',
      params: i18n(
        msg('notifPolHoldersTitle', { count: mine.length }),
        msg('notifSentences', {
          sentences: [
            ...top.map((s) => msg('notifPolHoldingLine', { symbol: s, actors: bySymbol.get(s)!.map((l) => l.msg) })),
            ...(more > 0 ? [msg('notifAndMore', { n: more })] : []),
          ],
        }),
      ),
    });
    if (result.success) sent++;
  }
  return sent;
}

// ─── Economic calendar ───────────────────────────────────────────────────────

export interface EconomicReleaseToday {
  kind: EconomicKind;
  release_at: string;
}

/**
 * Morning-of heads-up for today's scheduled economic releases, to users who
 * opted in (settings.notifications.economic_events === true; off by default,
 * unlike the per-holding notifications, because it is market-wide).
 *
 * Each user only hears about the releases they follow: the Economic picks in
 * the Market Calendar (settings.calendar_prefs.economicKinds, all by default).
 *
 * The stored title/message carry ET times as a fallback. The notification
 * list re-renders the times in the viewer's own zone and adds the read/watch
 * links from entity_id ("economic:<date>").
 */
export async function notifyEconomicEventsToday(date: string, events: EconomicReleaseToday[]): Promise<number> {
  if (events.length === 0) return 0;
  const supabase = createServerClient();
  const entityId = `economic:${date}`;

  // Opted-in users, paginated: PostgREST silently caps an unbounded select at 1000.
  const users: Array<{ id: string; kinds: Set<EconomicKind> }> = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('users')
      .select('id, settings')
      .eq('settings->notifications->>economic_events', 'true')
      .order('id')
      .range(from, from + 999);
    if (error) throw error;
    for (const u of data ?? []) {
      const settings = (u.settings as Record<string, unknown> | null) ?? {};
      users.push({ id: u.id as string, kinds: new Set(parseCalendarPrefs(settings[CALENDAR_PREFS_KEY]).economicKinds) });
    }
    if (!data || data.length < 1000) break;
  }
  if (users.length === 0) return 0;
  const userIds = users.map((u) => u.id);

  // One query for everyone already told about today, instead of one per user.
  const { data: existing } = await supabase
    .from('notifications')
    .select('user_id')
    .eq('entity_id', entityId)
    .in('user_id', userIds);
  const done = new Set((existing ?? []).map((n) => n.user_id as string));

  const et = (iso: string) =>
    new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' });
  const rows = users.flatMap(({ id: user_id, kinds }) => {
    if (done.has(user_id)) return [];
    const mine = events.filter((e) => kinds.has(e.kind));
    if (mine.length === 0) return [];
    const first = mine[0];
    const title = mine.length === 1
      ? `${ECONOMIC_KINDS[first.kind].name} today at ${et(first.release_at)} ET`
      : `${mine.length} economic releases today`;
    const message = mine.map((e) => `${ECONOMIC_KINDS[e.kind].name} at ${et(e.release_at)} ET`).join(' · ');
    // Only the title is worded: the panel lists the releases itself, in the reader's zone.
    const params = i18n(mine.length === 1
      ? msg('notifEconomicOne', { name: [msg(`tools:economicName_${first.kind}`)], time: et(first.release_at) })
      : msg('notifEconomicMany', { count: mine.length }));
    return [{ user_id, type: 'market', title, message, entity_type: 'market', entity_id: entityId, severity: 'info', params }];
  });
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.from('notifications').insert(rows.slice(i, i + 500));
    if (error) throw error;
  }
  return rows.length;
}

// ─── Index membership ────────────────────────────────────────────────────────

const INDEX_NAMES: Record<IndexId, string> = { sp500: 'S&P 500', nasdaq100: 'Nasdaq-100', dow30: 'Dow 30' };

/** user id -> upper-case symbols they hold (open, alerts on) and, optionally, watch (alerts on). */
async function usersTracking(symbols: string[], includeWatchlist: boolean): Promise<Map<string, Set<string>>> {
  const supabase = createServerClient();
  const out = new Map<string, Set<string>>();
  if (symbols.length === 0) return out;
  for (const table of includeWatchlist ? (['user_holdings', 'user_watchlist'] as const) : (['user_holdings'] as const)) {
    // Paginated: a popular stock can have more than PostgREST's silent 1000-row cap.
    for (let from = 0; ; from += 1000) {
      let q = supabase.from(table).select('user_id, symbol').in('symbol', symbols).eq('alerts_enabled', true);
      if (table === 'user_holdings') q = q.or(OPEN_POSITION_FILTER);
      const { data, error } = await q.order('user_id').range(from, from + 999);
      if (error) throw error;
      for (const r of (data ?? []) as { user_id: string; symbol: string }[]) {
        out.set(r.user_id, (out.get(r.user_id) ?? new Set()).add(r.symbol.toUpperCase()));
      }
      if (!data || data.length < 1000) break;
    }
  }
  return out;
}

/**
 * Two kinds of notification for one sync's index changes, both switched off by
 * settings.notifications.index_changes === false:
 *  - per stock, to everyone who watches or holds it:
 *    entity_id "<TICKER>:index-<change>:<index>:<detected_on>", the card links to the stock.
 *  - per index, to holders of a fund that tracks it (TRACKERS: VOO, QQQ, DIA...), one
 *    summary leaving out the stocks they already heard about above:
 *    entity_id "index-fund:<index>:<detected_on>", the card links to the index page.
 * Idempotent on entity_id.
 */
export async function notifyIndexMembershipChanges(events: IndexChangeEvent[]): Promise<number> {
  if (events.length === 0) return 0;
  const supabase = createServerClient();
  const indices = [...new Set(events.map((e) => e.indexId))];
  const [stockTrackers, fundHolders] = await Promise.all([
    usersTracking([...new Set(events.map((e) => e.ticker))], true),
    usersTracking(indices.flatMap((id) => TRACKERS[id]), false),
  ]);
  const userIds = [...new Set([...stockTrackers.keys(), ...fundHolders.keys()])];
  if (userIds.length === 0) return 0;

  const { data: users, error: usersError } = await supabase.from('users').select('id, settings').in('id', userIds);
  if (usersError) throw usersError;
  const optedOut = new Set(
    ((users ?? []) as Array<{ id: string; settings: { notifications?: Record<string, boolean> } | null }>)
      .filter((u) => u.settings?.notifications?.index_changes === false)
      .map((u) => u.id),
  );

  const stockEntity = (e: IndexChangeEvent) => `${e.ticker}:index-${e.change}:${e.indexId}:${e.detectedOn}`;
  const list = (items: string[]) => new Intl.ListFormat('en', { type: 'conjunction' }).format(items);
  const rows: Array<{ user_id: string; type: 'market'; title: string; message: string; entity_type: 'stock' | 'market'; entity_id: string; severity: 'info'; params: I18nParams }> = [];

  for (const [user_id, mine] of stockTrackers) {
    if (optedOut.has(user_id)) continue;
    for (const e of events.filter((ev) => mine.has(ev.ticker))) {
      const name = INDEX_NAMES[e.indexId];
      const week = shortDate(indexChangeWeekOf(e.detectedOn));
      rows.push({
        user_id,
        type: 'market',
        title: e.change === 'added' ? `${e.ticker} joined the ${name}` : `${e.ticker} left the ${name}`,
        message: e.change === 'added'
          ? `It was added in the week of ${week}. Funds that track the ${name} now own it.`
          : `It was removed in the week of ${week}. Funds that track the ${name} no longer own it.`,
        entity_type: 'stock',
        entity_id: stockEntity(e),
        severity: 'info',
        params: i18n(
          msg(e.change === 'added' ? 'notifIndexJoined' : 'notifIndexLeft', { symbol: e.ticker, index: name }),
          msg(e.change === 'added' ? 'notifIndexJoinedMessage' : 'notifIndexLeftMessage', { index: name, week: { date: indexChangeWeekOf(e.detectedOn) } }),
        ),
      });
    }
  }

  for (const [user_id, held] of fundHolders) {
    if (optedOut.has(user_id)) continue;
    const toldAbout = stockTrackers.get(user_id) ?? new Set<string>();
    for (const indexId of indices) {
      const funds = TRACKERS[indexId].filter((f) => held.has(f));
      const mine = events.filter((e) => e.indexId === indexId && !toldAbout.has(e.ticker));
      if (funds.length === 0 || mine.length === 0) continue;
      const name = INDEX_NAMES[indexId];
      const week = shortDate(indexChangeWeekOf(mine[0].detectedOn));
      const yours = `your ${list(funds)}`;
      const one = mine.length === 1 ? mine[0] : null;
      const joined = mine.filter((e) => e.change === 'added').map((e) => e.ticker);
      const left = mine.filter((e) => e.change === 'removed').map((e) => e.ticker);
      const weekOf = { date: indexChangeWeekOf(mine[0].detectedOn) };
      const params = one
        ? i18n(
          msg(one.change === 'added' ? 'notifIndexFundNowOwns' : 'notifIndexFundNoLongerOwns', { funds, symbol: one.ticker }),
          msg(one.change === 'added' ? 'notifIndexFundOneAdded' : 'notifIndexFundOneRemoved', { symbol: one.ticker, index: name, week: weekOf }),
        )
        : i18n(
          msg('notifIndexFundChanged', { index: name, funds }),
          msg('notifSentences', {
            sentences: [
              ...(joined.length > 0 ? [msg('notifIndexJoinedList', { list: joined })] : []),
              ...(left.length > 0 ? [msg('notifIndexLeftList', { list: left })] : []),
              msg('notifIndexWeek', { week: weekOf }),
            ],
          }),
        );
      rows.push({
        user_id,
        type: 'market',
        title: one
          ? `${yours[0].toUpperCase()}${yours.slice(1)} ${one.change === 'added' ? 'now owns' : 'no longer owns'} ${one.ticker}`
          : `The ${name} changed, and so did ${yours}`,
        message: one
          ? `${one.ticker} ${one.change === 'added' ? 'joined' : 'left'} the ${name} in the week of ${week}, so funds that track it ${one.change === 'added' ? 'bought' : 'sold'} it.`
          : [joined.length > 0 && `Joined: ${joined.join(', ')}.`, left.length > 0 && `Left: ${left.join(', ')}.`, `In the week of ${week}.`]
              .filter(Boolean).join(' '),
        entity_type: 'market',
        entity_id: `index-fund:${indexId}:${mine[0].detectedOn}`,
        severity: 'info',
        params,
      });
    }
  }
  if (rows.length === 0) return 0;

  const { data: existing, error } = await supabase
    .from('notifications')
    .select('user_id, entity_id')
    .in('entity_id', [...new Set(rows.map((r) => r.entity_id))])
    .in('user_id', [...new Set(rows.map((r) => r.user_id))]);
  if (error) throw error;
  const done = new Set((existing ?? []).map((n) => `${n.user_id}|${n.entity_id}`));
  const fresh = rows.filter((r) => !done.has(`${r.user_id}|${r.entity_id}`));
  for (let i = 0; i < fresh.length; i += 500) {
    const { error: insertError } = await supabase.from('notifications').insert(fresh.slice(i, i + 500));
    if (insertError) throw insertError;
  }
  return fresh.length;
}
