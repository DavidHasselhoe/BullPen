/**
 * Smart notification creator helpers.
 *
 * Centralises notification wording and severity logic so cron jobs stay thin.
 * All functions call createNotification() which handles DB dedup.
 * "Daily dedup" — each function checks if a notification for the same
 * user + entity was already created in the past 12 hours before calling
 * createNotification, preventing duplicate daily-digest spam.
 */

import { createNotification, type CreateNotificationInput } from './notifications-db';
import { createServerClient } from '@/lib/supabase/client';

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
}

// ─── Dedup helpers ────────────────────────────────────────────────────────────

/**
 * Returns true if a notification of the given type + entity_id already exists
 * for this user within the past 12 hours. Used to prevent duplicate daily alerts.
 */
async function alreadyNotifiedToday(
  userId: string,
  type: 'price_move' | 'earnings' | 'ai_insight' | 'market' | 'dividend' | 'health_score' | 'weekly_pick' | 'daily_brief',
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
  const input: CreateNotificationInput = {
    user_id: userId,
    type: 'price_move',
    title: `${mover.symbol} moved ${sign}${pct.toFixed(1)}% today`,
    message: `${name} closed at $${mover.price.toFixed(2)} (${sign}$${mover.change.toFixed(2)})`,
    entity_type: 'stock',
    entity_id: dedupeId,
    severity,
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
      const topList = gainers
        .slice(0, 5)
        .map((m) => `${m.symbol} +${m.changePercent.toFixed(1)}%`)
        .join(', ');
      const suffix = gainers.length > 5 ? ` +${gainers.length - 5} more` : '';
      const result = await createNotification({
        user_id: userId,
        type: 'price_move',
        title: `${gainers.length} tracked stock${gainers.length === 1 ? '' : 's'} up today (${gainers[0].symbol} +${gainers[0].changePercent.toFixed(1)}%)`,
        message: topList + suffix,
        entity_type: 'portfolio',
        entity_id: dedupeId,
        severity: 'info',
      });
      if (result.success) created = true;
    }
  }

  if (losers.length > 0) {
    const dedupeId = 'portfolio:price_digest_loss';
    if (!(await alreadyNotifiedToday(userId, 'price_move', dedupeId))) {
      const topList = losers
        .slice(0, 5)
        .map((m) => `${m.symbol} ${m.changePercent.toFixed(1)}%`)
        .join(', ');
      const suffix = losers.length > 5 ? ` +${losers.length - 5} more` : '';
      const result = await createNotification({
        user_id: userId,
        type: 'price_move',
        title: `${losers.length} tracked stock${losers.length === 1 ? '' : 's'} down today (${losers[0].symbol} ${losers[0].changePercent.toFixed(1)}%)`,
        message: topList + suffix,
        entity_type: 'portfolio',
        entity_id: dedupeId,
        severity: losers.some((m) => Math.abs(m.changePercent) >= 10) ? 'warning' : 'info',
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
  const input: CreateNotificationInput = {
    user_id: userId,
    type: 'price_move',
    title: `Your portfolio ${sign}${recap.dayPct.toFixed(2)}% today`,
    message: `${recap.holdingsCount} holding${recap.holdingsCount === 1 ? '' : 's'} · ${recap.topSymbol} ${topSign}${recap.topPct.toFixed(1)}% led`,
    entity_type: 'portfolio',
    entity_id: dedupeId,
    severity: 'info',
  };

  const result = await createNotification(input);
  return result.success;
}

// ─── User-defined alert notifications ────────────────────────────────────────

import { describeAlert, type UserAlert } from '@/types/alerts';

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

  const input: CreateNotificationInput = {
    user_id: userId,
    type: 'price_move',
    title: `${alert.symbol} hit ${priceStr}`,
    message: `${name} — your alert "${describeAlert(alert)}" was triggered.`,
    entity_type: 'user_alert',
    entity_id: dedupeId,
    severity: 'info',
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
    supabase.from('user_holdings').select('user_id, symbol, company_name').in('symbol', symbols).eq('alerts_enabled', true) as unknown as
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
    title: `${count} tracked stock${count === 1 ? '' : 's'} go${count === 1 ? 'es' : ''} ex-dividend soon`,
    message: tickerList + suffix,
    entity_type: 'portfolio',
    entity_id: dedupeId,
    severity: 'info',
  };

  const result = await createNotification(input);
  return result.success;
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
  const tickerList = items
    .slice(0, 5)
    .map((e) => e.symbol)
    .join(', ');

  const suffix = count > 5 ? ` +${count - 5} more` : '';

  const input: CreateNotificationInput = {
    user_id: userId,
    type: 'earnings',
    title: `${count} tracked stock${count === 1 ? '' : 's'} report${count === 1 ? 's' : ''} earnings today`,
    message: tickerList + suffix,
    entity_type: 'portfolio',
    entity_id: dedupeId,
    severity: 'info',
  };

  const result = await createNotification(input);
  return result.success;
}
