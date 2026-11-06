/**
 * Pure rules for user-defined alerts (check-user-alerts cron): whether the condition holds, and
 * whether that means fire, re-arm or nothing. Test: npm run test-alert-eval
 */
import type { AlertType } from '@/types/alerts';

export interface AlertState {
  alert_type: AlertType;
  threshold: number | string;
  baseline_value: number | string | null;
  last_triggered_at: string | null;
  armed: boolean;
}
export interface AlertQuote { c: number; dp: number }
export interface AlertRange { week52High: number | null; week52Low: number | null }

const COOLDOWN_MS = 24 * 60 * 60 * 1000;
/** Fire once per crossing: armed goes false on fire and true once the condition is false again. */
const LEVEL_TYPES = new Set<AlertType>(['price_above', 'price_below', 'near_52w_high', 'near_52w_low']);

export const isLevelAlert = (type: AlertType) => LEVEL_TYPES.has(type);

/** `triggered: null` = not enough data to tell, so neither fire nor re-arm. */
export function evaluateAlert(alert: AlertState, quote: AlertQuote | null, range: AlertRange | null): { triggered: boolean | null; newBaseline?: number } {
  if (!quote || !isFinite(quote.c) || quote.c <= 0) return { triggered: null };
  const threshold = Number(alert.threshold);
  const price = quote.c;

  switch (alert.alert_type) {
    case 'price_above':
      return { triggered: price >= threshold };
    case 'price_below':
      return { triggered: price <= threshold };
    case 'pct_change_up':
      return { triggered: isFinite(quote.dp) ? quote.dp >= threshold * 100 : null };
    case 'pct_change_down':
      return { triggered: isFinite(quote.dp) ? quote.dp <= -threshold * 100 : null };
    case 'near_52w_high': {
      const high = range?.week52High;
      if (!high || high <= 0) return { triggered: null };
      return { triggered: price >= high * (1 - threshold) };
    }
    case 'near_52w_low': {
      const low = range?.week52Low;
      if (!low || low <= 0) return { triggered: null };
      return { triggered: price <= low * (1 + threshold) };
    }
    case 'all_time_high': {
      const baseline = alert.baseline_value === null ? 0 : Number(alert.baseline_value);
      return price > baseline ? { triggered: true, newBaseline: price } : { triggered: false };
    }
  }
}

/** What the cron does with an evaluated alert. At most one fire per 24h, and level alerts once per crossing. */
export function alertAction(alert: AlertState, triggered: boolean | null, now: number): 'fire' | 'rearm' | 'none' {
  const level = isLevelAlert(alert.alert_type);
  if (triggered === null) return 'none';
  if (!triggered) return level && !alert.armed ? 'rearm' : 'none';
  if (level && !alert.armed) return 'none';
  if (alert.last_triggered_at && now - new Date(alert.last_triggered_at).getTime() < COOLDOWN_MS) return 'none';
  return 'fire';
}
