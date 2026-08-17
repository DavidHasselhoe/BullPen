/**
 * User-Defined Alerts Cron
 *  GET /api/cron/check-user-alerts
 *
 * Schedule: 30 14-21 * * 1-5 UTC  → 9:30 AM → 4:30 PM ET, hourly, Mon-Fri.
 * Auth:     Bearer CRON_SECRET header.
 *
 * For every active alert that hasn't fired in 24h:
 *   1. Batch-fetch quote + (when needed) statistics for the union of symbols.
 *   2. Evaluate each alert's condition against the latest data.
 *   3. Write a notification row + bump last_triggered_at on triggered alerts.
 *      For all_time_high alerts we also update baseline_value to the new max.
 *
 * Cost: ~2 credits per unique symbol per run.
 */

import { NextRequest, NextResponse } from 'next/server';
import { logSecurityEvent } from '@/lib/security/security-events';
import { createServerClient } from '@/lib/supabase/client';
import { getStockQuotes, getStatistics } from '@/lib/twelvedata/twelvedata-client';
import { createUserAlertNotification } from '@/lib/notifications/notification-creators';
import type { AlertType, UserAlert } from '@/types/alerts';

export const maxDuration = 120;

interface AlertRow {
  id: string;
  user_id: string;
  symbol: string;
  company_name: string | null;
  alert_type: AlertType;
  threshold: number | string;
  baseline_value: number | string | null;
  last_triggered_at: string | null;
  trigger_count: number;
}

interface EvalResult {
  triggered: boolean;
  /** For ATH alerts: the new baseline to persist when triggered. */
  newBaseline?: number;
}

function evaluate(
  alert: AlertRow,
  quote: { c: number; dp: number } | null,
  stats: { week52High: number | null; week52Low: number | null } | null
): EvalResult {
  if (!quote || !isFinite(quote.c) || quote.c <= 0) return { triggered: false };
  const threshold = Number(alert.threshold);
  const price = quote.c;
  const pctDay = quote.dp;

  switch (alert.alert_type) {
    case 'price_above':
      return { triggered: price >= threshold };
    case 'price_below':
      return { triggered: price <= threshold };
    case 'pct_change_up':
      return { triggered: pctDay >= threshold * 100 };
    case 'pct_change_down':
      return { triggered: pctDay <= -threshold * 100 };
    case 'near_52w_high': {
      const high = stats?.week52High;
      if (!high || high <= 0) return { triggered: false };
      return { triggered: price >= high * (1 - threshold) };
    }
    case 'near_52w_low': {
      const low = stats?.week52Low;
      if (!low || low <= 0) return { triggered: false };
      return { triggered: price <= low * (1 + threshold) };
    }
    case 'all_time_high': {
      const baseline = alert.baseline_value === null ? 0 : Number(alert.baseline_value);
      if (price > baseline) {
        return { triggered: true, newBaseline: price };
      }
      return { triggered: false };
    }
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    logSecurityEvent('cron_secret_mismatch', { path: '/api/cron/check-user-alerts' });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServerClient();

  // 1. Load every alert that COULD fire this run (active, not triggered in 24h)
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: alertsData, error } = await supabase
    .from('user_alerts')
    .select('id, user_id, symbol, company_name, alert_type, threshold, baseline_value, last_triggered_at, trigger_count')
    .eq('is_active', true)
    .or(`last_triggered_at.is.null,last_triggered_at.lt.${cutoff}`);

  if (error) {
    console.error('[check-user-alerts] load failed:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  const alerts = (alertsData ?? []) as AlertRow[];
  if (alerts.length === 0) {
    return NextResponse.json({ success: true, evaluated: 0, fired: 0 });
  }

  // 2. Batch-fetch market data for the union of symbols
  const symbols = [...new Set(alerts.map((a) => a.symbol.toUpperCase()))];
  const needsStats = alerts.some(
    (a) => a.alert_type === 'near_52w_high' || a.alert_type === 'near_52w_low'
  );

  let quoteMap: Awaited<ReturnType<typeof getStockQuotes>> = new Map();
  const statsMap: Map<string, { week52High: number | null; week52Low: number | null }> = new Map();

  try {
    quoteMap = await getStockQuotes(symbols);
  } catch (err) {
    console.error('[check-user-alerts] quote fetch failed:', err);
  }

  if (needsStats) {
    // getStatistics is per-symbol. Despite this comment's previous claim of
    // "a small concurrency cap," this used to fire every symbol's request via
    // Promise.allSettled(symbols.map(...)) with no cap at all — the exact
    // same unbounded-fan-out shape that caused the TwelveData credit-spike
    // investigation elsewhere this session. Fetching one symbol at a time
    // means a slow/degraded TwelveData response only ever blocks on one
    // request instead of dozens piling up concurrently and compounding the
    // account-wide load that caused them to be slow in the first place.
    for (const s of symbols) {
      try {
        const stats = await getStatistics(s);
        statsMap.set(s, { week52High: stats.week52High, week52Low: stats.week52Low });
      } catch (err) {
        console.error(`[check-user-alerts] statistics fetch failed for ${s}:`, err);
      }
    }
  }

  // 3. Evaluate + trigger
  let fired = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  for (const alert of alerts) {
    const symUp = alert.symbol.toUpperCase();
    const quote = quoteMap.get(symUp) ?? null;
    const stats = statsMap.get(symUp) ?? null;

    const { triggered, newBaseline } = evaluate(alert, quote, stats);
    if (!triggered || !quote) continue;

    // Build the lightweight UserAlert shape needed by the notification creator
    const dto: Pick<UserAlert, 'id' | 'symbol' | 'companyName' | 'alertType' | 'threshold'> = {
      id: alert.id,
      symbol: alert.symbol,
      companyName: alert.company_name,
      alertType: alert.alert_type,
      threshold: Number(alert.threshold),
    };

    const notified = await createUserAlertNotification(alert.user_id, dto, quote.c);
    if (!notified) continue;

    // Persist trigger state. For ATH alerts, raise the baseline so subsequent
    // runs only fire on a new high — not the same one repeatedly.
    const update: Record<string, unknown> = {
      last_triggered_at: new Date().toISOString(),
      trigger_count: alert.trigger_count + 1,
    };
    if (newBaseline !== undefined) {
      update.baseline_value = newBaseline;
    }

    await db.from('user_alerts').update(update).eq('id', alert.id);
    fired++;
  }

  return NextResponse.json({
    success: true,
    evaluated: alerts.length,
    fired,
    uniqueSymbols: symbols.length,
  });
}
