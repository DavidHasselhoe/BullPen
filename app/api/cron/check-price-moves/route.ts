/**
 * Price-Move Alert Cron Job
 * GET /api/cron/check-price-moves
 *
 * Runs after US market close (9:30 PM UTC / 4:30 PM ET + buffer), Mon–Fri.
 * Drives two independently-toggleable notifications — price_alerts (movers) and
 * portfolio_recap (daily P/L) — for every user who has at least one enabled:
 *   1. Collects all their tracked stocks (watchlist + holdings) with alerts_enabled = true
 *   2. Batch-fetches quotes for all unique symbols (shared across all users — very credit-efficient)
 *   3. If portfolio_recap is on: creates the daily portfolio recap notification
 *   4. If price_alerts is on: creates a grouped or individual notification for stocks that moved ≥5%
 *
 * Credit cost: ~1 credit per 20 unique symbols across ALL users combined.
 * For 500 unique symbols: 25 batch calls = 25 credits per day.
 */

import { NextRequest, NextResponse } from 'next/server';
import { logSecurityEvent } from '@/lib/security/security-events';
import { createServerClient } from '@/lib/supabase/client';
import { getStockCandles } from '@/lib/market-data';
import {
  createPriceMoveNotification,
  createPriceMoveDigestNotification,
  createPortfolioRecapNotification,
  type PriceMover,
} from '@/lib/notifications/notification-creators';

export const maxDuration = 300;

// Minimum absolute % change to qualify as a significant move
const MOVE_THRESHOLD_PCT = 5;

// Live /quote snapshots can occasionally return a stale or wrong previous_close
// (observed: TwelveData briefly reported a stock at -30% intraday when the real
// close-to-close move was +11%), which would otherwise trigger a false, alarming
// price-move alert. Moves at or above this magnitude get cross-checked against
// real daily candles — a different endpoint/cache path, so it isn't affected by
// the same transient glitch — before they're allowed to notify anyone.
const SANITY_CHECK_THRESHOLD_PCT = 15;
// How far the quote's claimed % change may disagree with the candle-verified
// change before we distrust the quote entirely.
const SANITY_CHECK_TOLERANCE_PCT = 5;

/**
 * Re-derives a symbol's day change from its last two daily candles and compares
 * it to the live quote's claimed change. Returns false if they disagree beyond
 * tolerance (or verification itself fails) — callers should drop the mover
 * rather than risk alerting on bad data.
 */
async function verifyLargeMove(symbol: string, claimedPct: number): Promise<boolean> {
  try {
    const now = Math.floor(Date.now() / 1000);
    const candles = await getStockCandles(symbol, now - 7 * 24 * 60 * 60, now, 'D');
    if (candles.s !== 'ok' || candles.c.length < 2) return false;
    const prevClose = candles.c[candles.c.length - 2];
    const lastClose = candles.c[candles.c.length - 1];
    if (!prevClose || !lastClose) return false;
    const verifiedPct = ((lastClose - prevClose) / prevClose) * 100;
    return Math.abs(verifiedPct - claimedPct) <= SANITY_CHECK_TOLERANCE_PCT;
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    logSecurityEvent('cron_secret_mismatch', { path: '/api/cron/check-price-moves' });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServerClient();
  const summary = {
    usersChecked: 0,
    usersNotified: 0,
    symbolsChecked: 0,
    notificationsCreated: 0,
    errors: [] as string[],
  };

  try {
    // ── 1. Fetch all users with price_alerts and/or portfolio_recap enabled ──
    // settings is a JSONB column; NULL or missing key both mean "enabled by default".
    // price_alerts (movers) and portfolio_recap (daily P/L) are independent toggles,
    // so a user only needs one of the two on to be worth fetching here — the per-user
    // gate below decides which of the two notifications they actually get.
    const { data: users, error: usersErr } = await supabase
      .from('users')
      .select('id, settings')
      .or(
        'settings->notifications->price_alerts.is.null,settings->notifications->price_alerts.eq.true,' +
        'settings->notifications->portfolio_recap.is.null,settings->notifications->portfolio_recap.eq.true'
      ) as unknown as
      { data: Array<{ id: string; settings: Record<string, unknown> | null }> | null; error: unknown };

    if (usersErr || !users?.length) {
      return NextResponse.json({ ...summary, error: 'No eligible users or query failed' });
    }

    const userSettings = new Map(users.map((u) => [u.id, u.settings]));
    const wantsPriceAlerts = (userId: string) =>
      (userSettings.get(userId) as { notifications?: Record<string, boolean> } | null)?.notifications?.price_alerts !== false;
    const wantsPortfolioRecap = (userId: string) =>
      (userSettings.get(userId) as { notifications?: Record<string, boolean> } | null)?.notifications?.portfolio_recap !== false;

    // ── 2. Collect (userId → symbol[]) from watchlist + holdings ──────────
    const [watchlistRes, holdingsRes] = await Promise.all([
      supabase
        .from('user_watchlist')
        .select('user_id, symbol, company_name')
        .eq('alerts_enabled', true) as unknown as Promise<{ data: Array<{ user_id: string; symbol: string; company_name: string }> | null }>,
      supabase
        .from('user_holdings')
        .select('user_id, symbol, company_name, quantity')
        .eq('alerts_enabled', true) as unknown as Promise<{ data: Array<{ user_id: string; symbol: string; company_name: string; quantity: number | null }> | null }>,
    ]);

    // Build per-user symbol map
    const eligibleUserIds = new Set(users.map((u) => u.id));
    const userSymbols = new Map<string, Map<string, string>>(); // userId → (symbol → companyName)
    // Held quantities (for the portfolio recap) — watchlist isn't part of the portfolio.
    const userHoldings = new Map<string, Array<{ symbol: string; quantity: number }>>();

    for (const row of [...(watchlistRes.data ?? []), ...(holdingsRes.data ?? [])]) {
      if (!eligibleUserIds.has(row.user_id)) continue;
      if (!userSymbols.has(row.user_id)) userSymbols.set(row.user_id, new Map());
      // Holdings/watchlist may duplicate the same symbol — prefer the first name seen
      if (!userSymbols.get(row.user_id)!.has(row.symbol)) {
        userSymbols.get(row.user_id)!.set(row.symbol, row.company_name || row.symbol);
      }
    }

    for (const row of holdingsRes.data ?? []) {
      if (!eligibleUserIds.has(row.user_id) || !row.quantity || row.quantity <= 0) continue;
      if (!userHoldings.has(row.user_id)) userHoldings.set(row.user_id, []);
      userHoldings.get(row.user_id)!.push({ symbol: row.symbol, quantity: row.quantity });
    }

    if (userSymbols.size === 0) {
      return NextResponse.json({ ...summary, message: 'No tracked symbols with alerts enabled' });
    }

    // ── 3. Batch-quote all unique symbols (shared across all users) ────────
    const allSymbols = [
      ...new Set([...userSymbols.values()].flatMap((m) => [...m.keys()])),
    ];
    summary.symbolsChecked = allSymbols.length;

    const quoteMap = new Map<string, { price: number; change: number; changePercent: number }>();
    const BATCH_SIZE = 20;
    const origin = request.nextUrl.origin;

    for (let i = 0; i < allSymbols.length; i += BATCH_SIZE) {
      const batch = allSymbols.slice(i, i + BATCH_SIZE);
      try {
        const res = await fetch(`${origin}/api/quotes/batch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cronSecret}` },
          body: JSON.stringify({ symbols: batch }),
        });
        if (res.ok) {
          const json = await res.json();
          for (const [sym, q] of Object.entries(json.quotes ?? {})) {
            quoteMap.set(sym, q as { price: number; change: number; changePercent: number });
          }
        }
      } catch (e) {
        summary.errors.push(`Quote batch failed for ${batch.join(',')}: ${String(e)}`);
      }
    }

    // ── 3b. Sanity-check implausibly large moves before they can alert anyone ──
    const untrustedSymbols = new Set<string>();
    const outliers = allSymbols.filter((s) => {
      const q = quoteMap.get(s);
      return q && Math.abs(q.changePercent) >= SANITY_CHECK_THRESHOLD_PCT;
    });
    await Promise.all(
      outliers.map(async (symbol) => {
        const trusted = await verifyLargeMove(symbol, quoteMap.get(symbol)!.changePercent);
        if (!trusted) {
          untrustedSymbols.add(symbol);
          summary.errors.push(
            `Discarded implausible move for ${symbol}: quote claimed ${quoteMap.get(symbol)!.changePercent.toFixed(1)}%, failed daily-candle verification`
          );
        }
      })
    );

    // ── 4. For each user — find movers and create notifications ───────────
    summary.usersChecked = userSymbols.size;

    for (const [userId, symbolMap] of userSymbols.entries()) {
      const movers: PriceMover[] = [];

      for (const [symbol, companyName] of symbolMap.entries()) {
        const q = quoteMap.get(symbol);
        if (!q || untrustedSymbols.has(symbol)) continue;
        if (Math.abs(q.changePercent) >= MOVE_THRESHOLD_PCT) {
          movers.push({ symbol, companyName, ...q });
        }
      }

      // ── Daily portfolio recap (runs regardless of the 5% mover threshold) ──
      const holdings = wantsPortfolioRecap(userId) ? userHoldings.get(userId) : undefined;
      if (holdings?.length) {
        let prevValue = 0;
        let dayChange = 0;
        let counted = 0;
        let top: { symbol: string; pct: number; contrib: number } | null = null;
        for (const h of holdings) {
          const q = quoteMap.get(h.symbol);
          if (!q || untrustedSymbols.has(h.symbol)) continue;
          const prevPrice = q.price - q.change;
          if (prevPrice <= 0) continue;
          prevValue += prevPrice * h.quantity;
          const contrib = q.change * h.quantity;
          dayChange += contrib;
          counted++;
          if (!top || Math.abs(contrib) > Math.abs(top.contrib)) {
            top = { symbol: h.symbol, pct: q.changePercent, contrib };
          }
        }
        if (prevValue > 0 && top && counted > 0) {
          const ok = await createPortfolioRecapNotification(userId, {
            dayPct: (dayChange / prevValue) * 100,
            topSymbol: top.symbol,
            topPct: top.pct,
            holdingsCount: counted,
          });
          if (ok) summary.notificationsCreated++;
        }
      }

      if (movers.length === 0 || !wantsPriceAlerts(userId)) continue;

      let created = false;
      if (movers.length >= 3) {
        // Grouped digest for 3+ movers
        created = await createPriceMoveDigestNotification(userId, movers);
      } else {
        // Individual notification per mover (1–2 stocks)
        for (const mover of movers) {
          const ok = await createPriceMoveNotification(userId, mover);
          if (ok) created = true;
        }
      }

      if (created) {
        summary.usersNotified++;
        summary.notificationsCreated += movers.length >= 3 ? 1 : movers.length;
      }
    }
  } catch (err) {
    summary.errors.push(String(err));
  }

  return NextResponse.json(summary);
}
