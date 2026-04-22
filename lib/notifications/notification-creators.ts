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
 * Create a single grouped notification when 3+ tracked stocks moved significantly.
 * Lists top movers by absolute change percent in the message.
 */
export async function createPriceMoveDigestNotification(
  userId: string,
  movers: PriceMover[]
): Promise<boolean> {
  const dedupeId = 'portfolio:price_digest';
  if (await alreadyNotifiedToday(userId, 'price_move', dedupeId)) return false;

  const count = movers.length;
  const topMovers = movers
    .sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent))
    .slice(0, 5)
    .map((m) => `${m.symbol} ${m.changePercent > 0 ? '+' : ''}${m.changePercent.toFixed(1)}%`)
    .join(', ');

  const input: CreateNotificationInput = {
    user_id: userId,
    type: 'price_move',
    title: `${count} tracked stocks moved 5%+ today`,
    message: topMovers,
    entity_type: 'portfolio',
    entity_id: dedupeId,
    severity: 'info',
  };

  const result = await createNotification(input);
  return result.success;
}

// ─── Earnings upcoming notifications ─────────────────────────────────────────

/**
 * Create a notification when tracked stocks have earnings in the next 7 days.
 * Groups all upcoming tickers into a single notification per user per day.
 */
export async function createEarningsUpcomingNotification(
  userId: string,
  items: EarningsItem[]
): Promise<boolean> {
  const dedupeId = 'portfolio:earnings_upcoming';
  if (await alreadyNotifiedToday(userId, 'earnings', dedupeId)) return false;

  const count = items.length;
  // Sort by soonest date first
  const sorted = [...items].sort((a, b) => a.date.localeCompare(b.date));

  // Format: "AAPL (Apr 30), MSFT (Apr 28)"
  const tickerList = sorted
    .slice(0, 5)
    .map((e) => {
      const d = new Date(e.date + 'T12:00:00Z'); // noon UTC to avoid timezone shift
      const formatted = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      return `${e.symbol} (${formatted})`;
    })
    .join(', ');

  const suffix = count > 5 ? ` +${count - 5} more` : '';

  const input: CreateNotificationInput = {
    user_id: userId,
    type: 'earnings',
    title: `${count} tracked stock${count === 1 ? '' : 's'} report${count === 1 ? 's' : ''} earnings this week`,
    message: tickerList + suffix,
    entity_type: 'portfolio',
    entity_id: dedupeId,
    severity: 'info',
  };

  const result = await createNotification(input);
  return result.success;
}
