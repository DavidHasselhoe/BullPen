/**
 * POST /api/screener/refresh
 *
 * Fetches TwelveData /statistics for a batch of symbols and upserts them into
 * screener_stats. Also stamps market_cap + last_refreshed_at back onto
 * screener_universe and promotes any ticker clearing the market-cap floor to
 * tier 1, so the active set self-maintains toward ~S&P 1500 breadth.
 *
 * Query params:
 *   mode=active|discovery   (default active)
 *   batch=N                 (active mode only; 0-indexed slice of the active universe)
 *
 * Active mode: refreshes a 10-symbol slice of the tier-1 universe (ordered by
 *   market cap). Used by the daily + extended crons.
 * Discovery mode: refreshes the 10 least-recently-refreshed tier-0 tickers to
 *   discover their market caps (and promote the big ones). Self-consuming — no
 *   batch index needed.
 *
 * Credits per call: 10 × 50 = 500. Rate limit 610/min → ~1 call/min with headroom.
 */

import { NextRequest, NextResponse } from 'next/server';
import { TwelveDataRateLimitError } from '@/lib/twelvedata/twelvedata-client';
import { withRateLimit, addSecurityHeaders } from '@/lib/security/api-security';
import { createServerClient } from '@/lib/supabase/client';
import {
  getActiveUniverse,
  getDiscoveryBatch,
  MARKET_CAP_PROMOTION_FLOOR,
} from '@/lib/market-data/screener-universe';
import { fetchAndUpsertScreenerStats } from '@/lib/market-data/screener-stats';

export const dynamic = 'force-dynamic';

const BATCH_SIZE = 10;

/** Stamp market_cap + last_refreshed_at onto screener_universe and promote big caps. */
async function stampUniverse(rows: { ticker: string; market_cap: number | null }[]) {
  if (rows.length === 0) return;
  const supabase = createServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const now = new Date().toISOString();

  const stamp = rows.map((r) => ({ ticker: r.ticker, market_cap: r.market_cap, last_refreshed_at: now }));
  await db.from('screener_universe').upsert(stamp, { onConflict: 'ticker' }).then(
    () => undefined,
    () => undefined,
  );

  const promote = rows
    .filter((r) => (r.market_cap ?? 0) >= MARKET_CAP_PROMOTION_FLOOR)
    .map((r) => r.ticker);
  if (promote.length > 0) {
    await db.from('screener_universe').update({ tier: 1 }).in('ticker', promote).eq('tier', 0).then(
      () => undefined,
      () => undefined,
    );
  }
}

async function handler(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const mode = sp.get('mode') === 'discovery' ? 'discovery' : 'active';
  const batchIndex = parseInt(sp.get('batch') ?? '0', 10);

  if (!process.env.TWELVE_DATA_API_KEY) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'TWELVE_DATA_API_KEY not configured' }, { status: 500 })
    );
  }

  let symbols: string[];
  let totalBatches: number | undefined;

  if (mode === 'discovery') {
    symbols = await getDiscoveryBatch(BATCH_SIZE);
  } else {
    const universe = await getActiveUniverse();
    totalBatches = Math.ceil(universe.length / BATCH_SIZE);
    const start = batchIndex * BATCH_SIZE;
    symbols = universe.slice(start, start + BATCH_SIZE);
  }

  if (symbols.length === 0) {
    return addSecurityHeaders(
      NextResponse.json({ success: true, done: true, mode, totalBatches })
    );
  }

  try {
    const rows = await fetchAndUpsertScreenerStats(symbols);
    await stampUniverse(rows.map((r) => ({ ticker: r.ticker, market_cap: r.market_cap })));

    const promoted = rows.filter((r) => (r.market_cap ?? 0) >= MARKET_CAP_PROMOTION_FLOOR).length;

    if (mode === 'discovery') {
      // Self-consuming: "done" once a sweep returns fewer than a full batch.
      return addSecurityHeaders(
        NextResponse.json({
          success: true,
          mode,
          refreshed: rows.length,
          promoted,
          symbols,
          done: symbols.length < BATCH_SIZE,
        })
      );
    }

    const nextBatch = totalBatches != null && batchIndex + 1 < totalBatches ? batchIndex + 1 : null;
    return addSecurityHeaders(
      NextResponse.json({
        success: true,
        mode,
        batch: batchIndex,
        refreshed: rows.length,
        promoted,
        symbols,
        nextBatch,
        totalBatches,
        done: nextBatch === null,
      })
    );
  } catch (err) {
    if (err instanceof TwelveDataRateLimitError) {
      return addSecurityHeaders(
        NextResponse.json({ success: false, error: 'rate_limited' }, { status: 429 })
      );
    }
    return addSecurityHeaders(
      NextResponse.json(
        { success: false, error: err instanceof Error ? err.message : 'Unknown error' },
        { status: 500 }
      )
    );
  }
}

// Limit to 5 refresh calls per minute — each costs 500 credits
export const POST = withRateLimit(handler, { windowMs: 60_000, maxRequests: 5 });
