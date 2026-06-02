/**
 * POST /api/screener/seed-universe
 *
 * Seeds the screener_universe reference table:
 *   1. Broad pass — TwelveData /stocks (US, NYSE/NASDAQ, common stock + ADR)
 *      inserted as tier=0 (on-demand only; known/searchable long tail).
 *   2. Index pass — S&P 500 + Nasdaq 100 forced to tier=1 (actively refreshed).
 *
 * Subsequent runs preserve existing tiers (the broad pass skips existing rows),
 * so market-cap-based promotions are not clobbered.
 *
 * Auth: Bearer CRON_SECRET. Run once to bootstrap, then occasionally to pick up
 * newly-listed tickers.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import { getUsStocksList, TwelveDataRateLimitError } from '@/lib/twelvedata/twelvedata-client';
import { SP500_TICKERS } from '@/lib/market-data/sp500';
import { NASDAQ100_TICKERS } from '@/lib/market-data/nasdaq100';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const ACTIVE_EXCHANGES = new Set(['NYSE', 'NASDAQ']);
const ALLOWED_TYPES = new Set(['Common Stock', 'American Depositary Receipt']);
const UPSERT_CHUNK = 500;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  try {
    // ── 1. Broad pass — seed the long tail as tier 0 ──────────────────────────
    const stocks = await getUsStocksList({ country: 'United States' });
    const filtered = stocks.filter(
      (s) => ACTIVE_EXCHANGES.has(s.exchange) && ALLOWED_TYPES.has(s.type)
    );
    // Dedup by ticker (TwelveData can list the same symbol on multiple MICs).
    const seen = new Set<string>();
    const broadRows = filtered
      .filter((s) => {
        const t = s.symbol.toUpperCase();
        if (seen.has(t)) return false;
        seen.add(t);
        return true;
      })
      .map((s) => ({
        ticker: s.symbol.toUpperCase(),
        name: s.name,
        exchange: s.exchange,
        type: s.type,
        country: s.country,
        tier: 0,
        source: 'twelvedata_stocks',
      }));

    let broadInserted = 0;
    for (const group of chunk(broadRows, UPSERT_CHUNK)) {
      // Insert-only: never downgrade an already-promoted (tier 1) row.
      const { error, count } = await db
        .from('screener_universe')
        .upsert(group, { onConflict: 'ticker', ignoreDuplicates: true, count: 'exact' });
      if (error) throw new Error(`broad seed: ${error.message}`);
      broadInserted += count ?? 0;
    }

    // ── 2. Index pass — force S&P 500 + Nasdaq 100 to tier 1 ───────────────────
    const sp500 = new Set(SP500_TICKERS.map((t) => t.toUpperCase()));
    const indexRows = [...new Set([...SP500_TICKERS, ...NASDAQ100_TICKERS].map((t) => t.toUpperCase()))]
      .map((ticker) => ({
        ticker,
        tier: 1,
        source: sp500.has(ticker) ? 'sp500' : 'nasdaq100',
      }));

    for (const group of chunk(indexRows, UPSERT_CHUNK)) {
      const { error } = await db
        .from('screener_universe')
        .upsert(group, { onConflict: 'ticker' });
      if (error) throw new Error(`index seed: ${error.message}`);
    }

    const { count: activeCount } = await db
      .from('screener_universe')
      .select('ticker', { count: 'exact', head: true })
      .eq('tier', 1);

    return NextResponse.json({
      success: true,
      broadCandidates: broadRows.length,
      broadInserted,
      indexTier1: indexRows.length,
      activeTier1Total: activeCount ?? null,
    });
  } catch (err) {
    if (err instanceof TwelveDataRateLimitError) {
      return NextResponse.json({ success: false, error: 'rate_limited' }, { status: 429 });
    }
    console.error('[screener/seed-universe] failed:', err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
