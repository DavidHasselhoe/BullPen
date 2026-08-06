/**
 * Shared screener-stats fetch/upsert pipeline.
 *
 * Used by:
 *  - the daily refresh cron (app/api/screener/refresh) to populate the
 *    actively-tracked universe,
 *  - the screener GET route (app/api/screener) to lazily fetch any ticker a
 *    user references (holdings / watchlist / custom views) that isn't cached
 *    yet, and
 *  - the "My Stocks" heatmap route (app/api/tools/heatmap?mode=my-stocks) for
 *    the same reason.
 *
 * One TwelveData /statistics batch POST = ~53 credits per symbol, reserved
 * against the shared cron credit budget (lib/twelvedata/credit-budget.ts)
 * per chunk before it fires — this covers all three callers above uniformly,
 * since only the cron used to reserve for this externally.
 *
 * Health score is computed alongside stats. On a cold symbol this also fetches
 * income / balance / cash-flow — each of those three costs ~101 credits on
 * this plan (confirmed live against TwelveData's /api_usage endpoint, see
 * app/api/cron/prefetch-market-data/route.ts's doc comment for the full story),
 * NOT the ~1 credit a symbol-count-based estimate would suggest. ~303
 * credits/cold-symbol is enough on its own to blow past the shared cron
 * credit-budget, so each statement fetch reserves against it individually
 * before firing (see fetchFinancials below) — cache hits reserve nothing.
 * Symbols within a chunk are fetched one at a time, not fanned out: firing a
 * whole chunk concurrently meant every symbol's statements raced the same
 * budget independently, mostly lost, and mostly fired unreserved anyway
 * within the 8s grace window — this was the actual mechanism behind observed
 * per-minute spikes into the thousands, far past the 610/min plan cap.
 */

import { createServerClient } from '@/lib/supabase/client';
import {
  batchFetch,
  getIncomeStatement,
  getBalanceSheet,
  getCashFlow,
  withRateLimitRetry,
  type CompanyStatistics,
  type IncomeStatementPeriod,
  type BalanceSheetPeriod,
  type CashFlowPeriod,
} from '@/lib/twelvedata/twelvedata-client';
import { getCached, getCachedStale, setCached } from '@/lib/cache/market-data-cache';
import { computeHealthScore } from '@/lib/finance/health-score';
import { recordHealthScoreSnapshot } from '@/lib/finance/health-score-history';
import { waitForCronCreditBudget } from '@/lib/twelvedata/credit-budget';
import type { ScreenerRow } from '@/app/api/screener/route';

/** Real measured cost of /income_statement, /balance_sheet, /cash_flow on this
 *  plan (see doc comment above) — reserved against the shared cron credit
 *  budget before each actual cache-miss fetch, same rule as every other
 *  fan-out caller of these three endpoints. */
const CREDITS_PER_FINANCIALS_STATEMENT = 101;
/** Short wait like app/api/compare/route.ts, not the crons' default 65s —
 *  this path is shared with the interactive /api/screener and heatmap
 *  on-demand fetches, which must not hang for minutes waiting on the shared
 *  budget. waitForCronCreditBudget proceeds anyway once maxWaitMs elapses (a
 *  pacing guard, not a hard cap), so this only bounds how long a request
 *  waits before firing — it doesn't skip the fetch. This is why
 *  fetchFinancials is called sequentially per symbol below rather than
 *  fanned out with Promise.all: firing a whole chunk's worth of symbols at
 *  once meant every one of them raced this same 8s window independently,
 *  almost all lost, and almost all fired unreserved anyway — a single cold
 *  10-symbol chunk could burst 3,000+ credits in under 10 seconds this way. */
const FINANCIALS_BUDGET_WAIT_MS = 8_000;

/** /statistics costs ~53 credits/symbol (matches app/api/screener/refresh/
 *  route.ts's CREDITS_PER_SYMBOL) — reserved against the same shared budget
 *  before each chunk's batchFetch, so every caller of this function is
 *  covered uniformly (previously only the nightly-cron caller reserved for
 *  this externally; the on-demand /api/screener and /api/tools/heatmap
 *  routes fired it completely unguarded). */
const CREDITS_PER_STATS_SYMBOL = 53;

/** Max symbols per TwelveData /batch POST. Sized so one chunk's /statistics
 *  reservation (CHUNK_SIZE * CREDITS_PER_STATS_SYMBOL = 265) fits inside the
 *  400-credit shared budget — CHUNK_SIZE=10 would need 530, which can never
 *  be reserved and would make the guard a no-op (always time out, always
 *  fire anyway). Matches BATCH_SIZE already used by screener/refresh and
 *  STATS_BATCH_SIZE in prefetch-market-data for the same reason. */
const CHUNK_SIZE = 5;
/** 7 days, matching prefetch-market-data.ts's FINANCIALS_TTL for the same
 *  cache keys — quarterly statements don't change daily, so a 24h TTL (the
 *  previous value here) forced a full re-fetch of the ~101-credit-per-
 *  statement endpoints for most of the active universe every single night,
 *  on top of being the source of most cold-symbol churn feeding the burst
 *  described above. */
const FINANCIALS_TTL = 7 * 24 * 60 * 60;

interface TwelveDataStatisticsRaw {
  meta?: {
    symbol?: string;
    name?: string;
    currency?: string;
    exchange?: string;
    country?: string;
  };
  statistics?: {
    valuations_metrics?: {
      market_capitalization?: number | null;
      enterprise_value?: number | null;
      trailing_pe?: number | null;
      forward_pe?: number | null;
      price_to_book_mrq?: number | null;
      price_to_sales_ttm?: number | null;
      enterprise_to_ebitda?: number | null;
    };
    stock_statistics?: {
      avg_90_volume?: number | null;
      float_shares?: number | null;
      short_ratio?: number | null;
    };
    stock_price_summary?: {
      beta?: number | null;
      fifty_two_week_high?: number | null;
      fifty_two_week_low?: number | null;
      fifty_day_ma?: number | null;
      two_hundred_day_ma?: number | null;
    };
    dividends_and_splits?: {
      forward_annual_dividend_yield?: number | null;
      payout_ratio?: number | null;
    };
    financials?: {
      profit_margin?: number | null;
      total_revenue?: number | null;
      diluted_eps?: number | null;
      income_statement?: {
        quarterly_revenue_growth?: number | null;
        quarterly_earnings_growth_yoy?: number | null;
      };
    };
  };
  status?: string;
  code?: number;
  message?: string;
}

/** Map a raw TwelveData /statistics payload to the screener_stats column shape. */
export function parseStats(raw: TwelveDataStatisticsRaw, sym: string) {
  const s = raw.statistics ?? {};
  const v = s.valuations_metrics ?? {};
  const sp = s.stock_price_summary ?? {};
  const d = s.dividends_and_splits ?? {};
  const f = s.financials ?? {};
  const fi = f.income_statement ?? {};

  return {
    ticker: sym,
    market_cap: v.market_capitalization ? Math.round(v.market_capitalization) : null,
    pe_ratio: v.trailing_pe ?? null,
    forward_pe: v.forward_pe ?? null,
    pb_ratio: v.price_to_book_mrq ?? null,
    ps_ratio: v.price_to_sales_ttm ?? null,
    ev_to_ebitda: v.enterprise_to_ebitda ?? null,
    beta: sp.beta ?? null,
    avg_volume: s.stock_statistics?.avg_90_volume ? Math.round(s.stock_statistics.avg_90_volume) : null,
    week52_high: sp.fifty_two_week_high ?? null,
    week52_low: sp.fifty_two_week_low ?? null,
    day50_ma: sp.fifty_day_ma ?? null,
    day200_ma: sp.two_hundred_day_ma ?? null,
    dividend_yield: d.forward_annual_dividend_yield ?? null,
    payout_ratio: d.payout_ratio ?? null,
    profit_margin: f.profit_margin ?? null,
    revenue_ttm: f.total_revenue ? Math.round(f.total_revenue) : null,
    eps_ttm: f.diluted_eps ?? null,
    revenue_growth_yoy: fi.quarterly_revenue_growth != null ? fi.quarterly_revenue_growth * 100 : null,
    earnings_growth_yoy: fi.quarterly_earnings_growth_yoy != null ? fi.quarterly_earnings_growth_yoy * 100 : null,
    updated_at: new Date().toISOString(),
  };
}

/** Build a CompanyStatistics object from the raw TwelveData batch payload. */
function rawToCompanyStats(raw: TwelveDataStatisticsRaw, sym: string): CompanyStatistics {
  const s = raw.statistics ?? {};
  const v = s.valuations_metrics ?? {};
  const sp = s.stock_price_summary ?? {};
  const ss = s.stock_statistics ?? {};
  const d = s.dividends_and_splits ?? {};
  const f = s.financials ?? {};
  const fi = f.income_statement ?? {};
  return {
    symbol: sym,
    marketCap: v.market_capitalization ?? null,
    enterpriseValue: v.enterprise_value ?? null,
    peRatioTTM: v.trailing_pe ?? null,
    peRatioForward: v.forward_pe ?? null,
    pbRatio: v.price_to_book_mrq ?? null,
    evToEbitda: v.enterprise_to_ebitda ?? null,
    beta: sp.beta ?? null,
    week52High: sp.fifty_two_week_high ?? null,
    week52Low: sp.fifty_two_week_low ?? null,
    avgVolume: ss.avg_90_volume ?? null,
    sharesFloat: ss.float_shares ?? null,
    shortRatio: ss.short_ratio ?? null,
    dividendYield: d.forward_annual_dividend_yield ?? null,
    profitMargin: f.profit_margin ?? null,
    revenueGrowthTTM: fi.quarterly_revenue_growth ?? null,
    epsGrowthTTM: fi.quarterly_earnings_growth_yoy ?? null,
  };
}

/** Fetch quarterly financials for one symbol, hitting the shared market_data_cache first. */
async function fetchFinancials(sym: string): Promise<{
  income: IncomeStatementPeriod[];
  balance: BalanceSheetPeriod[];
  cashflow: CashFlowPeriod[];
  /** True if any statement fetch failed even after retry (e.g. rate-limited) — the
   *  resulting health score should not overwrite a previously good persisted one. */
  degraded: boolean;
}> {
  let degraded = false;
  let incomeFresh = false;
  let balanceFresh = false;
  let cashflowFresh = false;

  const [income, balance, cashflow] = await Promise.all([
    getCached<IncomeStatementPeriod[]>(`financials:${sym}:income:quarterly`).then(async (c) => {
      if (c) return c;
      try {
        await waitForCronCreditBudget(CREDITS_PER_FINANCIALS_STATEMENT, FINANCIALS_BUDGET_WAIT_MS);
        const fresh = await withRateLimitRetry(() => getIncomeStatement(sym, 'quarterly'));
        incomeFresh = true;
        return fresh;
      } catch (err) {
        console.warn(`[screener-stats] income fetch failed for ${sym}:`, err instanceof Error ? err.message : err);
        const stale = await getCachedStale<IncomeStatementPeriod[]>(`financials:${sym}:income:quarterly`);
        if (!stale) degraded = true;
        return stale ?? [];
      }
    }),
    getCached<BalanceSheetPeriod[]>(`financials:${sym}:balance:quarterly`).then(async (c) => {
      if (c) return c;
      try {
        await waitForCronCreditBudget(CREDITS_PER_FINANCIALS_STATEMENT, FINANCIALS_BUDGET_WAIT_MS);
        const fresh = await withRateLimitRetry(() => getBalanceSheet(sym, 'quarterly'));
        balanceFresh = true;
        return fresh;
      } catch (err) {
        console.warn(`[screener-stats] balance sheet fetch failed for ${sym}:`, err instanceof Error ? err.message : err);
        const stale = await getCachedStale<BalanceSheetPeriod[]>(`financials:${sym}:balance:quarterly`);
        if (!stale) degraded = true;
        return stale ?? [];
      }
    }),
    getCached<CashFlowPeriod[]>(`financials:${sym}:cashflow:quarterly`).then(async (c) => {
      if (c) return c;
      try {
        await waitForCronCreditBudget(CREDITS_PER_FINANCIALS_STATEMENT, FINANCIALS_BUDGET_WAIT_MS);
        const fresh = await withRateLimitRetry(() => getCashFlow(sym, 'quarterly'));
        cashflowFresh = true;
        return fresh;
      } catch (err) {
        console.warn(`[screener-stats] cash flow fetch failed for ${sym}:`, err instanceof Error ? err.message : err);
        const stale = await getCachedStale<CashFlowPeriod[]>(`financials:${sym}:cashflow:quarterly`);
        if (!stale) degraded = true;
        return stale ?? [];
      }
    }),
  ]);

  // Warm the shared cache only with genuinely fresh data — reusing a stale
  // fallback must not reset the TTL, or a persistent fetch failure would look
  // freshly cached and never get retried again for another 7 days.
  if (incomeFresh)   void setCached(`financials:${sym}:income:quarterly`,   sym, 'financials', income,   FINANCIALS_TTL).catch(() => {});
  if (balanceFresh)  void setCached(`financials:${sym}:balance:quarterly`,  sym, 'financials', balance,  FINANCIALS_TTL).catch(() => {});
  if (cashflowFresh) void setCached(`financials:${sym}:cashflow:quarterly`, sym, 'financials', cashflow, FINANCIALS_TTL).catch(() => {});

  return { income, balance, cashflow, degraded };
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Fetch /statistics for the given symbols from TwelveData, enrich with company
 * metadata from Supabase, compute the BullPen health score from cached or freshly-
 * fetched financials, upsert everything into screener_stats, and return the rows.
 *
 * Chunks into batch POSTs of CHUNK_SIZE. Throws TwelveDataRateLimitError up to
 * the caller (which decides whether to 429 or degrade to partial results).
 */
export async function fetchAndUpsertScreenerStats(symbols: string[]): Promise<ScreenerRow[]> {
  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey) throw new Error('TWELVE_DATA_API_KEY not configured');

  const uniqueSymbols = [...new Set(symbols.map((s) => s.toUpperCase()).filter(Boolean))];
  if (uniqueSymbols.length === 0) return [];

  const supabase = createServerClient();

  // Company metadata (name / sector / industry / logo) for all symbols in one query.
  const { data: companies } = await supabase
    .from('companies')
    .select('ticker, name, sector, industry, logo_url')
    .in('ticker', uniqueSymbols);
  const companyMap = new Map(
    (companies ?? []).map((c) => [(c as { ticker: string }).ticker, c as {
      ticker: string; name: string | null; sector: string | null; industry: string | null; logo_url: string | null;
    }])
  );

  const rows: ScreenerRow[] = [];
  const degradedSymbols = new Set<string>();

  for (const group of chunk(uniqueSymbols, CHUNK_SIZE)) {
    await waitForCronCreditBudget(group.length * CREDITS_PER_STATS_SYMBOL);

    const requests: Record<string, string> = {};
    for (const sym of group) {
      requests[sym] = `/statistics?symbol=${encodeURIComponent(sym)}&apikey=${apiKey}`;
    }
    const raw = await batchFetch<TwelveDataStatisticsRaw>(requests);

    // Fetch financials one symbol at a time (not fanned out with Promise.all
    // — see FINANCIALS_BUDGET_WAIT_MS above for why). Cache hits are free; a
    // cold symbol costs up to 303 credits (3 statements x ~101), reserved
    // against the shared cron credit budget before it fires.
    const financialsMap = new Map<string, Awaited<ReturnType<typeof fetchFinancials>>>();
    for (const sym of group) {
      financialsMap.set(sym, await fetchFinancials(sym));
    }

    for (const sym of group) {
      const statsRaw = raw[sym];
      if (!statsRaw) continue;

      // The screener universe is US-only (see screener_universe seeding). TwelveData
      // resolves ambiguous/uncovered symbols to whatever global listing shares that
      // ticker string (e.g. "CTRA" → an Indonesian stock, not NYSE's Coterra Energy)
      // without erroring, so a currency mismatch means we got the wrong company's
      // financials entirely. Skip ingesting rather than persist corrupted numbers.
      if (statsRaw.meta?.currency && statsRaw.meta.currency !== 'USD') {
        console.warn(
          `[screener-stats] skipping ${sym}: TwelveData resolved it to "${statsRaw.meta.name}" ` +
          `(${statsRaw.meta.exchange}, ${statsRaw.meta.currency}) instead of a USD-listed company`
        );
        continue;
      }

      const stats = parseStats(statsRaw, sym);
      const company = companyMap.get(sym);

      // Compute health score from the full CompanyStatistics shape + financials
      const companyStats = rawToCompanyStats(statsRaw, sym);
      const { income, balance, cashflow, degraded } = financialsMap.get(sym) ?? { income: [], balance: [], cashflow: [], degraded: false };
      if (degraded) degradedSymbols.add(sym);
      const healthScore = computeHealthScore(companyStats, income, balance, cashflow);

      // Fire-and-forget: record a history snapshot only when we have complete,
      // non-degraded financials AND a real fiscal quarter identifier. The helper's
      // UNIQUE(ticker, fiscal_date) constraint makes this a no-op if this exact
      // quarter was already recorded (e.g. by yesterday's cron run, or by a user
      // visiting the stock page directly — see Task 4).
      if (!degraded && income[0]?.fiscal_date) {
        void recordHealthScoreSnapshot(sym, healthScore, income[0].fiscal_date);
      }

      rows.push({
        ...stats,
        name: company?.name ?? sym,
        sector: company?.sector ?? null,
        industry: company?.industry ?? null,
        logo_url: company?.logo_url ?? null,
        exchange: null,
        health_score: healthScore.score,
        health_score_grade: healthScore.grade,
      } as ScreenerRow);
    }
  }

  // For symbols whose financials fetch was rate-limited/errored (even after retry),
  // the freshly-computed health score is unreliable — restore the previously
  // persisted score instead of overwriting a good one with a falsely low one.
  if (degradedSymbols.size > 0) {
    const { data: priorRows } = await supabase
      .from('screener_stats')
      .select('ticker, health_score, health_score_grade')
      .in('ticker', [...degradedSymbols]);
    const priorMap = new Map(
      (priorRows ?? []).map((r) => [(r as { ticker: string }).ticker, r as { health_score: number | null; health_score_grade: string | null }])
    );
    for (const row of rows) {
      if (!degradedSymbols.has(row.ticker)) continue;
      const prior = priorMap.get(row.ticker);
      if (prior && prior.health_score != null) {
        row.health_score = prior.health_score;
        row.health_score_grade = prior.health_score_grade as ScreenerRow['health_score_grade'];
      }
    }
  }

  if (rows.length > 0) {
    const { error } = await supabase
      .from('screener_stats')
      .upsert(rows, { onConflict: 'ticker' });
    if (error) {
      console.error('[screener-stats] upsert error:', error);
      throw new Error(error.message);
    }
  }

  return rows;
}
