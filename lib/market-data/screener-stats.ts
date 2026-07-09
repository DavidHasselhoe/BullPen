/**
 * Shared screener-stats fetch/upsert pipeline.
 *
 * Used by:
 *  - the daily refresh cron (app/api/screener/refresh) to populate the
 *    actively-tracked universe, and
 *  - the screener GET route (app/api/screener) to lazily fetch any ticker a
 *    user references (holdings / watchlist / custom views) that isn't cached yet.
 *
 * One TwelveData /statistics batch POST = ~50 credits per symbol. Keep call
 * sites bounded (the cron paces with delays; the GET route caps on-demand size).
 *
 * Health score is computed alongside stats (+3 credits per cold symbol for
 * income / balance / cash-flow; cache hits cost 0 extra credits).
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
import { getCached, setCached } from '@/lib/cache/market-data-cache';
import { computeHealthScore } from '@/lib/finance/health-score';
import { recordHealthScoreSnapshot } from '@/lib/finance/health-score-history';
import type { ScreenerRow } from '@/app/api/screener/route';

/** Max symbols per TwelveData /batch POST. Stays well under the ~120 cap. */
const CHUNK_SIZE = 10;
const FINANCIALS_TTL = 24 * 60 * 60;

interface TwelveDataStatisticsRaw {
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

  const [income, balance, cashflow] = await Promise.all([
    getCached<IncomeStatementPeriod[]>(`financials:${sym}:income:quarterly`).then(
      (c) => c ?? withRateLimitRetry(() => getIncomeStatement(sym, 'quarterly')).catch(() => {
        degraded = true;
        return [] as IncomeStatementPeriod[];
      })
    ),
    getCached<BalanceSheetPeriod[]>(`financials:${sym}:balance:quarterly`).then(
      (c) => c ?? withRateLimitRetry(() => getBalanceSheet(sym, 'quarterly')).catch(() => {
        degraded = true;
        return [] as BalanceSheetPeriod[];
      })
    ),
    getCached<CashFlowPeriod[]>(`financials:${sym}:cashflow:quarterly`).then(
      (c) => c ?? withRateLimitRetry(() => getCashFlow(sym, 'quarterly')).catch(() => {
        degraded = true;
        return [] as CashFlowPeriod[];
      })
    ),
  ]);

  // Warm the shared cache so /health-score and /financials routes get free hits
  if (income.length)   void setCached(`financials:${sym}:income:quarterly`,   sym, 'financials', income,   FINANCIALS_TTL).catch(() => {});
  if (balance.length)  void setCached(`financials:${sym}:balance:quarterly`,  sym, 'financials', balance,  FINANCIALS_TTL).catch(() => {});
  if (cashflow.length) void setCached(`financials:${sym}:cashflow:quarterly`, sym, 'financials', cashflow, FINANCIALS_TTL).catch(() => {});

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
    const requests: Record<string, string> = {};
    for (const sym of group) {
      requests[sym] = `/statistics?symbol=${encodeURIComponent(sym)}&apikey=${apiKey}`;
    }
    const raw = await batchFetch<TwelveDataStatisticsRaw>(requests);

    // Fetch financials for all symbols in this group in parallel.
    // Cache hits are free; cold symbols cost +3 credits (vs 50 for stats).
    const financialsMap = new Map<string, Awaited<ReturnType<typeof fetchFinancials>>>();
    await Promise.all(
      group.map(async (sym) => {
        const financials = await fetchFinancials(sym);
        financialsMap.set(sym, financials);
      })
    );

    for (const sym of group) {
      const statsRaw = raw[sym];
      if (!statsRaw) continue;

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
