/**
 * GET/POST /api/cron/refresh-search-index
 *
 * Rebuilds `search_index`, the symbol catalogue the browser downloads once and
 * then searches locally on every keystroke (see /api/search/index).
 *
 * Two TwelveData reference calls, both very low credit cost: /stocks has no
 * funds in it at all, so without /etf the index has no SPY, QQQ or VOO — three
 * of the most-searched symbols there are.
 *
 * Weekly is plenty: this is a catalogue of what exists and what it is called,
 * not market data. Ranks come from market caps we already hold, so they age at
 * the same pace as `screener_stats` regardless of when this last ran.
 *
 * Auth: Bearer CRON_SECRET.
 */

import { NextRequest, NextResponse } from 'next/server';
import { logSecurityEvent } from '@/lib/security/security-events';
import { createServerClient } from '@/lib/supabase/client';
import { getUsStocksList, getUsEtfList, TwelveDataRateLimitError } from '@/lib/twelvedata/twelvedata-client';
import { rankFromMarketCap, rankFromEtfName, INDEX_MEMBER_RANK } from '@/lib/search/index-rank';
import { SP500_TICKERS } from '@/lib/market-data/sp500';
import { NASDAQ100_TICKERS } from '@/lib/market-data/nasdaq100';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Exchanges a retail user can actually trade on. OTC is deliberately excluded:
 *  it is 12k+ shells and delisted tickers, two-thirds of the /stocks feed, and
 *  including it makes the payload bigger and every search result worse. */
const MAIN_EXCHANGES = new Set(['NYSE', 'NASDAQ', 'CBOE', 'AMEX', 'NYSE American']);

/** Instrument types worth searching. Warrants, preferred shares and depositary
 *  units are tradeable but are never what someone typing "apple" wants. */
const STOCK_TYPES = new Set([
  'Common Stock',
  'American Depositary Receipt',
  'REIT',
  'Real Estate Investment Trust (REIT)',
]);

/** Real tradeable symbols. TwelveData's feed carries a few internal rows like
 *  "!OTC/FLZH" that are not symbols anyone can type or trade. */
const VALID_TICKER = /^[A-Z0-9][A-Z0-9.-]*$/;

const UPSERT_CHUNK = 500;

interface IndexRow {
  ticker: string;
  name: string;
  kind: 's' | 'e';
  exchange: string | null;
  rank: number;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Market caps for every ticker we hold stats on, paged past PostgREST's 1000-row cap. */
async function marketCaps(): Promise<Map<string, number>> {
  const supabase = createServerClient();
  const caps = new Map<string, number>();
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('screener_stats')
      .select('ticker, market_cap')
      .not('market_cap', 'is', null)
      .order('ticker', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`market caps: ${error.message}`);
    const rows = (data ?? []) as Array<{ ticker: string; market_cap: number | null }>;
    for (const r of rows) caps.set(r.ticker.toUpperCase(), Number(r.market_cap) || 0);
    if (rows.length < PAGE) break;
  }
  return caps;
}

async function handler(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    logSecurityEvent('cron_secret_mismatch', { path: '/api/cron/refresh-search-index' });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Sequential on purpose: these are a ~5.6MB and a ~3MB body. Fetched in
    // parallel they share the same connection budget and both run slower, which
    // pushed the pair past its timeout. The market-cap query is a different
    // resource, so that one does overlap.
    const capsPromise = marketCaps();
    const stocks = await getUsStocksList({ country: 'United States' });
    const etfs = await getUsEtfList({ country: 'United States' });
    const caps = await capsPromise;

    const indexMembers = new Set(
      [...SP500_TICKERS, ...NASDAQ100_TICKERS].map((t) => t.toUpperCase())
    );

    const seen = new Set<string>();
    const rows: IndexRow[] = [];

    // Stocks first so a symbol listed as both keeps its equity identity.
    for (const s of stocks) {
      if (!MAIN_EXCHANGES.has(s.exchange) || !STOCK_TYPES.has(s.type)) continue;
      const ticker = s.symbol.toUpperCase();
      if (seen.has(ticker) || !VALID_TICKER.test(ticker)) continue;
      seen.add(ticker);
      rows.push({
        ticker,
        name: s.name || ticker,
        kind: 's',
        exchange: s.exchange || null,
        rank:
          rankFromMarketCap(caps.get(ticker)) ||
          (indexMembers.has(ticker) ? INDEX_MEMBER_RANK : 0),
      });
    }

    for (const e of etfs) {
      if (!MAIN_EXCHANGES.has(e.exchange)) continue;
      const ticker = e.symbol.toUpperCase();
      if (seen.has(ticker) || !VALID_TICKER.test(ticker)) continue;
      seen.add(ticker);
      const name = e.name || ticker;
      rows.push({
        ticker,
        name,
        kind: 'e',
        exchange: e.exchange || null,
        rank: rankFromEtfName(ticker, name),
      });
    }

    if (rows.length < 1000) {
      // A short feed means TwelveData returned something unexpected. Refuse
      // rather than replacing a working index with a broken one.
      return NextResponse.json(
        { success: false, error: 'feed_too_small', rows: rows.length },
        { status: 502 }
      );
    }

    const supabase = createServerClient();
    const now = new Date().toISOString();
    for (const group of chunk(rows, UPSERT_CHUNK)) {
      const { error } = await supabase
        .from('search_index')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .upsert(group.map((r) => ({ ...r, updated_at: now })) as any, { onConflict: 'ticker' });
      if (error) throw new Error(`upsert: ${error.message}`);
    }

    // Anything not in this run's feed has been delisted or renamed away.
    const { error: pruneError } = await supabase
      .from('search_index')
      .delete()
      .lt('updated_at', now);
    if (pruneError) throw new Error(`prune: ${pruneError.message}`);

    return NextResponse.json({
      success: true,
      stocks: rows.filter((r) => r.kind === 's').length,
      etfs: rows.filter((r) => r.kind === 'e').length,
      total: rows.length,
      ranked: rows.filter((r) => r.rank > 0).length,
    });
  } catch (err) {
    if (err instanceof TwelveDataRateLimitError) {
      return NextResponse.json({ success: false, error: 'rate_limited' }, { status: 429 });
    }
    console.error('[cron/refresh-search-index] failed:', err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export const GET = handler;
export const POST = handler;
