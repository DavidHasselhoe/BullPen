/**
 * Price-Move Alert Cron Job
 * GET /api/cron/check-price-moves
 *
 * Runs after US market close (9:30 PM UTC / 4:30 PM ET + buffer), Mon–Fri.
 * For every user who has price_alerts enabled in their settings:
 *   1. Collects all their tracked stocks (watchlist + holdings) with alerts_enabled = true
 *   2. Batch-fetches quotes for all unique symbols (shared across all users — very credit-efficient)
 *   3. Creates a grouped or individual notification for stocks that moved ≥5%
 *
 * Credit cost: ~1 credit per 20 unique symbols across ALL users combined.
 * For 500 unique symbols: 25 batch calls = 25 credits per day.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import {
  createPriceMoveNotification,
  createPriceMoveDigestNotification,
  type PriceMover,
} from '@/lib/notifications/notification-creators';

export const maxDuration = 300;

// Minimum absolute % change to qualify as a significant move
const MOVE_THRESHOLD_PCT = 5;

export async function GET(request: NextRequest): Promise<NextResponse> {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
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
    // ── 1. Fetch all users with price_alerts enabled ────────────────────────
    // settings is a JSONB column; NULL or missing key both mean "enabled by default"
    const { data: users, error: usersErr } = await (supabase as any)
      .from('users')
      .select('id, settings')
      .or('settings->notifications->price_alerts.is.null,settings->notifications->price_alerts.eq.true') as
      { data: Array<{ id: string; settings: Record<string, any> | null }> | null; error: unknown };

    if (usersErr || !users?.length) {
      return NextResponse.json({ ...summary, error: 'No eligible users or query failed' });
    }

    // ── 2. Collect (userId → symbol[]) from watchlist + holdings ──────────
    const [watchlistRes, holdingsRes] = await Promise.all([
      (supabase as any)
        .from('user_watchlist')
        .select('user_id, symbol, company_name')
        .eq('alerts_enabled', true) as Promise<{ data: Array<{ user_id: string; symbol: string; company_name: string }> | null }>,
      (supabase as any)
        .from('user_holdings')
        .select('user_id, symbol, company_name')
        .eq('alerts_enabled', true) as Promise<{ data: Array<{ user_id: string; symbol: string; company_name: string }> | null }>,
    ]);

    // Build per-user symbol map
    const eligibleUserIds = new Set(users.map((u) => u.id));
    const userSymbols = new Map<string, Map<string, string>>(); // userId → (symbol → companyName)

    for (const row of [...(watchlistRes.data ?? []), ...(holdingsRes.data ?? [])]) {
      if (!eligibleUserIds.has(row.user_id)) continue;
      if (!userSymbols.has(row.user_id)) userSymbols.set(row.user_id, new Map());
      // Holdings/watchlist may duplicate the same symbol — prefer the first name seen
      if (!userSymbols.get(row.user_id)!.has(row.symbol)) {
        userSymbols.get(row.user_id)!.set(row.symbol, row.company_name || row.symbol);
      }
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

    // ── 4. For each user — find movers and create notifications ───────────
    summary.usersChecked = userSymbols.size;

    for (const [userId, symbolMap] of userSymbols.entries()) {
      const movers: PriceMover[] = [];

      for (const [symbol, companyName] of symbolMap.entries()) {
        const q = quoteMap.get(symbol);
        if (!q) continue;
        if (Math.abs(q.changePercent) >= MOVE_THRESHOLD_PCT) {
          movers.push({ symbol, companyName, ...q });
        }
      }

      if (movers.length === 0) continue;

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
