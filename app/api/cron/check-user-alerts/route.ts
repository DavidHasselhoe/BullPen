/**
 * User-Defined Alerts Cron
 *  GET /api/cron/check-user-alerts
 *
 * Schedule: QStash, every 5 minutes, 9:00-16:55 New York, Mon-Fri (docs/agent/scheduled-work.md). Only runs
 *           9:35-16:05 New York on a trading day (tradingMinutesET); other fires return at once.
 *           `?force=1` runs outside those hours (manual checks). `?dryRun=1` evaluates and lists
 *           what would fire or re-arm without writing, notifying or pushing (still quotes misses).
 * Auth:     Bearer CRON_SECRET header.
 *
 * For every active alert:
 *   1. Prices from the shared last-price cache (3 min old at most in session), and one batch
 *      quote for the symbols it doesn't have. 52-week high/low from screener_stats (nightly).
 *   2. Evaluate each alert's condition.
 *   3. Write a notification + bump last_triggered_at on triggered alerts, then push to those
 *      users right away (pushNow) instead of waiting for the 15-minute dispatcher.
 *
 * Firing rules: at most once per 24h per alert. Level alerts (price above/below, near the
 * 52-week high/low) also fire once per crossing: `armed` goes false when they fire and true
 * again once the condition is false (migration 193). all_time_high raises its baseline.
 *
 * Cost: 1 credit per alert symbol the cache misses, at most one batch per run. No /statistics.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withCronReport } from '@/lib/cron/report';
import { logSecurityEvent } from '@/lib/security/security-events';
import { createServerClient } from '@/lib/supabase/client';
import { getStockQuotes } from '@/lib/twelvedata/twelvedata-client';
import { waitForCronCreditBudget } from '@/lib/twelvedata/credit-budget';
import { getLastPrices, cacheLastPrice } from '@/lib/market-data/last-price-cache';
import { tradingMinutesET } from '@/lib/market-data/trading-day';
import { createUserAlertNotification } from '@/lib/notifications/notification-creators';
import { pushNow } from '@/lib/notifications/push-dispatch';
import { evaluateAlert, alertAction, isLevelAlert, type AlertQuote, type AlertRange } from '@/lib/alerts/evaluate-alert';
import type { AlertType, UserAlert } from '@/types/alerts';

export const maxDuration = 120;

/** 9:35 to 16:05 New York: skips the opening minutes, when a quote can still carry yesterday's change. */
const SESSION_FROM = 9 * 60 + 35;
const SESSION_TO = 16 * 60 + 5;

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
  armed: boolean;
}

async function handleGET(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    logSecurityEvent('cron_secret_mismatch', { path: '/api/cron/check-user-alerts' });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const mins = tradingMinutesET();
  const force = request.nextUrl.searchParams.get('force') === '1';
  const dryRun = request.nextUrl.searchParams.get('dryRun') === '1';
  if (!force && (mins === null || mins < SESSION_FROM || mins > SESSION_TO)) {
    return NextResponse.json({ success: true, skipped: true, evaluated: 0, fired: 0 });
  }

  const supabase = createServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  // 1. Every active alert: the ones in cooldown are still needed to re-arm.
  const { data: alertsData, error } = await db
    .from('user_alerts')
    .select('id, user_id, symbol, company_name, alert_type, threshold, baseline_value, last_triggered_at, trigger_count, armed')
    .eq('is_active', true);

  if (error) {
    console.error('[check-user-alerts] load failed:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  const alerts = (alertsData ?? []) as AlertRow[];
  if (alerts.length === 0) {
    return NextResponse.json({ success: true, evaluated: 0, fired: 0 });
  }

  // 2. Prices: the shared cache first, one budgeted batch quote for the misses.
  const symbols = [...new Set(alerts.map((a) => a.symbol.toUpperCase()))];
  const quoteMap = new Map<string, AlertQuote>();
  for (const [sym, hit] of await getLastPrices(symbols)) {
    if (hit.price > 0 && hit.changePercent !== null) quoteMap.set(sym, { c: hit.price, dp: hit.changePercent });
  }
  const cacheHits = quoteMap.size;
  const misses = symbols.filter((s) => !quoteMap.has(s));
  const errors: string[] = [];
  if (misses.length > 0) {
    try {
      await waitForCronCreditBudget(misses.length);
      for (const [sym, q] of await getStockQuotes(misses)) {
        if (!(q.c > 0)) continue;
        quoteMap.set(sym, { c: q.c, dp: q.dp });
        cacheLastPrice(sym, { price: q.c, changePercent: q.dp });
      }
    } catch (err) {
      errors.push(`quote fetch failed: ${String(err)}`);
    }
  }

  // 52-week range from the nightly screener refresh: no /statistics call (~50 credits a symbol).
  // ponytail: a symbol outside the screener universe has no row, so its 52w alerts never fire; fetch /statistics for those if one shows up
  const rangeMap = new Map<string, AlertRange>();
  const rangeSymbols = [...new Set(alerts
    .filter((a) => a.alert_type === 'near_52w_high' || a.alert_type === 'near_52w_low')
    .map((a) => a.symbol.toUpperCase()))];
  if (rangeSymbols.length > 0) {
    const { data: ranges, error: rangeErr } = await db
      .from('screener_stats')
      .select('ticker, week52_high, week52_low')
      .in('ticker', rangeSymbols);
    if (rangeErr) errors.push(`screener_stats: ${rangeErr.message}`);
    for (const r of (ranges ?? []) as { ticker: string; week52_high: number | null; week52_low: number | null }[]) {
      rangeMap.set(r.ticker.toUpperCase(), { week52High: r.week52_high, week52Low: r.week52_low });
    }
  }

  // 3. Evaluate, fire, re-arm.
  let fired = 0;
  const rearm: string[] = [];
  const notifiedUsers = new Set<string>();
  const wouldFire: string[] = [];
  const now = Date.now();

  for (const alert of alerts) {
    const symUp = alert.symbol.toUpperCase();
    const quote = quoteMap.get(symUp) ?? null;
    const { triggered, newBaseline } = evaluateAlert(alert, quote, rangeMap.get(symUp) ?? null);
    const action = alertAction(alert, triggered, now);
    if (action === 'rearm') rearm.push(alert.id);
    if (action !== 'fire' || !quote) continue;
    if (dryRun) {
      wouldFire.push(`${alert.alert_type} ${symUp} at ${quote.c}`);
      continue;
    }

    const dto: Pick<UserAlert, 'id' | 'symbol' | 'companyName' | 'alertType' | 'threshold'> = {
      id: alert.id,
      symbol: alert.symbol,
      companyName: alert.company_name,
      alertType: alert.alert_type,
      threshold: Number(alert.threshold),
    };

    const notified = await createUserAlertNotification(alert.user_id, dto, quote.c);
    if (!notified) continue;

    const update: Record<string, unknown> = {
      last_triggered_at: new Date().toISOString(),
      trigger_count: alert.trigger_count + 1,
    };
    if (isLevelAlert(alert.alert_type)) update.armed = false;
    if (newBaseline !== undefined) update.baseline_value = newBaseline;

    const { error: updErr } = await db.from('user_alerts').update(update).eq('id', alert.id);
    if (updErr) errors.push(`update ${alert.id}: ${updErr.message}`);
    notifiedUsers.add(alert.user_id);
    fired++;
  }

  if (dryRun) {
    return NextResponse.json({ success: true, dryRun: true, evaluated: alerts.length, wouldFire, wouldRearm: rearm.length, uniqueSymbols: symbols.length, cacheHits, quoted: misses.length, errors });
  }

  if (rearm.length > 0) {
    const { error: rearmErr } = await db.from('user_alerts').update({ armed: true }).in('id', rearm);
    if (rearmErr) errors.push(`re-arm: ${rearmErr.message}`);
  }

  const { pushed, pushErrors } = await pushNow(notifiedUsers);

  return NextResponse.json({
    success: true,
    evaluated: alerts.length,
    fired,
    rearmed: rearm.length,
    uniqueSymbols: symbols.length,
    cacheHits,
    quoted: misses.length,
    pushed,
    errors: [...errors, ...pushErrors],
  });
}

export const GET = withCronReport('check-user-alerts', handleGET);
