import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import { withRateLimit } from '@/lib/security/api-security';
import { fetchAndUpsertScreenerStats } from '@/lib/market-data/screener-stats';
import { TwelveDataRateLimitError, getStockQuotes, withRateLimitRetry } from '@/lib/twelvedata/twelvedata-client';
import { isDuplicateShareClass } from '@/lib/market-data/dual-class-shares';
import { fetchAllPages, loadScreenerUniverse, matchesScreenerFilters, type ScreenerFilterParams } from '@/lib/screener/screener-query';
import { getLastPrices, cacheLastPrice, type LastPriceSeed } from '@/lib/market-data/last-price-cache';

export const dynamic = 'force-dynamic';

/**
 * Max symbols to fetch on-demand in a single request. Symbol-filtered views
 * (holdings / watchlist / custom) reference a bounded set, so this caps abuse
 * while comfortably covering any real portfolio or watchlist.
 */
const ON_DEMAND_CAP = 50;

// ── Last-known price fallback ─────────────────────────────────────────────────
// The live price columns (Price/%Chg) only ever have a value once the SSE
// heatmap stream delivers a tick — with the market closed (or for tickers
// outside the S&P 500 the stream tracks) that never happens, so those cells
// rendered "—" forever. Hydrate every row with the last quoted price/change
// (Redis-cached, shared across all users) so a value always renders; the live
// stream still overlays a fresher number the moment a tick arrives.
const PRICE_QUOTE_CHUNK = 100;
// Bounds worst-case TwelveData credit burst on a cold cache (e.g. the "All"
// view's ~3000-ticker universe) to roughly one Venture per-minute allowance.
// Results are already ordered by market_cap desc, so this covers the tickers
// most likely to actually be viewed.
const PRICE_HYDRATION_CAP = 600;

async function hydrateLastPrices(tickers: string[]): Promise<Map<string, LastPriceSeed>> {
  const upper = [...new Set(tickers.map((t) => t.toUpperCase()))].slice(0, PRICE_HYDRATION_CAP);
  if (upper.length === 0) return new Map();

  const seeds = await getLastPrices(upper);
  const missing = upper.filter((t) => !seeds.has(t));

  if (missing.length > 0) {
    const chunks: string[][] = [];
    for (let i = 0; i < missing.length; i += PRICE_QUOTE_CHUNK) chunks.push(missing.slice(i, i + PRICE_QUOTE_CHUNK));

    await Promise.all(chunks.map(async (chunk) => {
      try {
        const quotes = await withRateLimitRetry(() => getStockQuotes(chunk));
        for (const [sym, q] of quotes.entries()) {
          if (!q || !isFinite(q.c) || q.c <= 0) continue;
          const seed: LastPriceSeed = { price: q.c, changePercent: isFinite(q.dp) ? q.dp : null };
          const symUpper = sym.toUpperCase();
          seeds.set(symUpper, seed);
          cacheLastPrice(symUpper, seed);
        }
      } catch (err) {
        // Non-fatal — rows just fall back to "—" same as before this existed.
        if (!(err instanceof TwelveDataRateLimitError)) {
          console.error('[screener] price hydration chunk failed:', err);
        }
      }
    }));
  }

  return seeds;
}

export interface ScreenerRow {
  ticker: string;
  name: string;
  sector: string | null;
  industry: string | null;
  logo_url: string | null;
  exchange: string | null;
  market_cap: number | null;
  pe_ratio: number | null;
  forward_pe: number | null;
  pb_ratio: number | null;
  ps_ratio: number | null;
  ev_to_ebitda: number | null;
  eps_ttm: number | null;
  revenue_ttm: number | null;
  profit_margin: number | null;
  revenue_growth_yoy: number | null;
  earnings_growth_yoy: number | null;
  beta: number | null;
  avg_volume: number | null;
  dividend_yield: number | null;
  payout_ratio: number | null;
  week52_high: number | null;
  week52_low: number | null;
  day50_ma: number | null;
  day200_ma: number | null;
  health_score: number | null;
  health_score_grade: string | null;
  health_profitability: number | null;
  health_financial_strength: number | null;
  health_cash_flow: number | null;
  /** Informational "how cheap" read, 0-20. Not part of health_score since method 2. */
  health_valuation: number | null;
  health_growth: number | null;
  health_market_risk: number | null;
  health_score_version: number;
  updated_at: string;
  /**
   * Last-known price/change from the most recent quote — hydrated only in the
   * GET response (never written back to screener_stats, which has no price
   * column). Falls back to this when the live SSE stream has no tick yet
   * (market closed, or the ticker is outside the stream's tracked set).
   */
  last_price?: number | null;
  last_change_pct?: number | null;
}

function parseNum(val: string | null): number | undefined {
  if (val == null) return undefined;
  const n = parseFloat(val);
  return isFinite(n) ? n : undefined;
}

async function handler(request: NextRequest) {
  const supabase = createServerClient();
  const sp = request.nextUrl.searchParams;

  // --- Symbol allowlist (used by screener views) ---
  const symbolsParam = sp.get('symbols');
  const symbolAllowlist = symbolsParam
    ? new Set(symbolsParam.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean))
    : null;

  // scope controls which slice of screener_stats the default (non-symbol) view returns:
  //   'all'    → every cached row (the full tracked universe)
  //   'sp500'  → only the real S&P 500 constituents (SP500_TICKERS)
  //   (none)   → the tier-1 actively-tracked universe via screener_active_rows()
  const scope = sp.get('scope');
  const scopeAll = scope === 'all';
  const scopeSp500 = scope === 'sp500';

  // Cheap path for the "View all (N)" pill — it needs the full database
  // ticker count regardless of whichever view/filters are currently active,
  // so it can't reuse the main query's `total` (that's scoped to the current
  // view). Fetches tickers only (not `select('*')`) and applies the same
  // dual-class dedup as the full "all" scope below, so this stays exactly
  // consistent with what that view's own `total` would read.
  if (scopeAll && sp.get('countOnly') === '1') {
    // Needs the ticker strings rather than a head count, because duplicate
    // share classes are filtered in JS below.
    const { rows, error } = await fetchAllPages<{ ticker: string }>(() =>
      supabase.from('screener_stats').select('ticker').order('ticker', { ascending: true })
    );
    if (error) {
      return NextResponse.json({ success: false, error }, { status: 500 });
    }
    const total = rows.filter((r) => !isDuplicateShareClass(r.ticker)).length;
    return NextResponse.json({ success: true, total });
  }

  // --- Parse filter params ---
  const sector = sp.get('sector') || undefined;
  const industry = sp.get('industry') || undefined;
  const healthScoreMin = parseNum(sp.get('healthScoreMin'));
  const healthScoreMax = parseNum(sp.get('healthScoreMax'));
  const marketCapMin = parseNum(sp.get('marketCapMin'));  // in billions on client, raw here
  const marketCapMax = parseNum(sp.get('marketCapMax'));
  const peMin = parseNum(sp.get('peMin'));
  const peMax = parseNum(sp.get('peMax'));
  const pbMin = parseNum(sp.get('pbMin'));
  const pbMax = parseNum(sp.get('pbMax'));
  const betaMin = parseNum(sp.get('betaMin'));
  const betaMax = parseNum(sp.get('betaMax'));
  const divYieldMin = parseNum(sp.get('divYieldMin'));
  const divYieldMax = parseNum(sp.get('divYieldMax'));
  const profitMarginMin = parseNum(sp.get('profitMarginMin'));
  const profitMarginMax = parseNum(sp.get('profitMarginMax'));
  const revenueGrowthMin = parseNum(sp.get('revenueGrowthMin'));
  const revenueGrowthMax = parseNum(sp.get('revenueGrowthMax'));
  const week52ChangeMin = parseNum(sp.get('week52ChangeMin'));
  const week52ChangeMax = parseNum(sp.get('week52ChangeMax'));

  const universe = await loadScreenerUniverse(supabase, {
    symbols: symbolAllowlist ? [...symbolAllowlist] : undefined,
    scope: scopeSp500 ? 'sp500' : scopeAll ? 'all' : 'active',
  });
  if (universe.error) {
    return NextResponse.json({ success: false, error: universe.error }, { status: 500 });
  }
  const baseRows = universe.rows;

  let results: ScreenerRow[] = baseRows;

  // Rows fetched on-demand this request (merged into sectors/industries below).
  let onDemandRows: ScreenerRow[] = [];
  let onDemandPartial = false;

  // On-demand: any requested ticker missing from screener_stats (e.g. a holding
  // or watchlist name outside the actively-refreshed universe — TSM, HOOD, etc.)
  // is fetched live, cached for next time, and included in this response.
  if (symbolAllowlist && symbolAllowlist.size > 0) {
    const present = new Set(results.map((r) => r.ticker.toUpperCase()));
    const missing = [...symbolAllowlist].filter((t) => !present.has(t));
    if (missing.length > 0) {
      try {
        onDemandRows = await fetchAndUpsertScreenerStats(missing.slice(0, ON_DEMAND_CAP));
        results = results.concat(onDemandRows);
      } catch (err) {
        // Rate-limited or upstream failure: serve what we have rather than 500.
        onDemandPartial = true;
        if (!(err instanceof TwelveDataRateLimitError)) {
          console.error('[screener] on-demand fetch failed:', err);
        }
      }
    }
  }

  // --- Apply filters ---
  const filters: ScreenerFilterParams = {
    sector, industry, healthScoreMin, healthScoreMax, marketCapMin, marketCapMax,
    peMin, peMax, pbMin, pbMax, betaMin, betaMax, divYieldMin, divYieldMax,
    profitMarginMin, profitMarginMax, revenueGrowthMin, revenueGrowthMax,
    week52ChangeMin, week52ChangeMax,
  };
  results = results.filter((r) => matchesScreenerFilters(r, filters));

  // Collect unique sectors and industries for filter dropdowns
  // (include any rows fetched on-demand so their sectors appear).
  const allRows = [...baseRows, ...onDemandRows];
  const sectors = [...new Set(
    allRows.map((r) => r.sector).filter(Boolean) as string[]
  )].sort();

  const sectorFilter = sector;
  const industriesSource = sectorFilter
    ? allRows.filter(r => r.sector === sectorFilter)
    : allRows;
  const industries = [...new Set(
    industriesSource.map(r => r.industry).filter(Boolean) as string[]
  )].sort();

  const financialsLoaded = allRows.filter((r) => r.market_cap != null).length;

  const priceSeeds = await hydrateLastPrices(results.map((r) => r.ticker));
  if (priceSeeds.size > 0) {
    results = results.map((r) => {
      const seed = priceSeeds.get(r.ticker.toUpperCase());
      return seed ? { ...r, last_price: seed.price, last_change_pct: seed.changePercent } : r;
    });
  }

  const response = NextResponse.json({
    success: true,
    results,
    sectors,
    industries,
    total: results.length,
    universeSize: baseRows.length,
    financialsLoaded,
    stale: baseRows.length === 0,
    ...(onDemandRows.length > 0 ? { onDemandFetched: onDemandRows.length } : {}),
    ...(onDemandPartial ? { partial: true } : {}),
  });
  response.headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=60');
  return response;
}

// 30 req/min
export const GET = withRateLimit(handler, { windowMs: 60_000, maxRequests: 30 });
