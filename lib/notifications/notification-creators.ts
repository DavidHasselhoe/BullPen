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
  type: 'price_move' | 'earnings' | 'ai_insight' | 'market',
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
  const direction = pct > 0 ? 'up' : 'down';
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
        title: `${gainers.length} tracked stock${gainers.length === 1 ? '' : 's'} up 5%+ today`,
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
        title: `${losers.length} tracked stock${losers.length === 1 ? '' : 's'} down 5%+ today`,
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
