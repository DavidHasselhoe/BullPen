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
 * since only the cron used to reserve for this externally. At CHUNK_SIZE=5
 * that's 265 credits, comfortably inside the 400-credit share, so the
 * reservation is always actually grantable.
 *
 * This function NEVER fetches income / balance / cash-flow live. It reads
 * them from the shared market_data_cache and nothing else. That restriction
 * is the whole point, so it is worth stating plainly:
 *
 *   Those three endpoints cost ~101 credits each on this plan (~303 per cold
 *   symbol), measured live against TwelveData's /api_usage endpoint. A
 *   5-symbol chunk therefore needs 265 + 5x303 = 1,780 credits, against a
 *   400-credit share. That reservation can never be granted, so every attempt
 *   timed out and fired anyway — 1,780 credits inside ~45 seconds, of which
 *   the budget bucket recorded 366. This produced multi-hour spike clusters
 *   of 350-2,050 credits/min against the 610/min plan cap (the variance being
 *   simply how many of the 5 symbols happened to have cold financials), and
 *   survived three rounds of tuning batch sizes, TTLs, and concurrency
 *   because none of those addressed the unsatisfiable reservation.
 *
 * Warming financials is therefore owned solely by the dedicated, correctly
 * paced phase in app/api/cron/prefetch-market-data/route.ts (?phase=financials),
 * which fetches ONE symbol per HTTP call and reserves its full 303 credits
 * up front — a reservation that always fits, 65s apart, across the same
 * screener universe. Both write the same `financials:<sym>:*:quarterly` cache
 * keys, so the health scores computed here pick the data up automatically.
 *
 * A symbol whose financials aren't warmed yet is reported `degraded`, which
 * makes fetchAndUpsertScreenerStats keep that ticker's previously persisted
 * health score rather than overwrite it with one computed from nothing.
 */

import { createServerClient } from '@/lib/supabase/client';
import {
  batchFetch,
  sanitizeDividendYield,
  type CompanyStatistics,
  type IncomeStatementPeriod,
  type BalanceSheetPeriod,
  type CashFlowPeriod,
} from '@/lib/twelvedata/twelvedata-client';
import { getCached, getCachedStale } from '@/lib/cache/market-data-cache';
import { computeHealthScore } from '@/lib/finance/health-score';
import { recordHealthScoreSnapshot } from '@/lib/finance/health-score-history';
import { waitForCronCreditBudget } from '@/lib/twelvedata/credit-budget';
import { notifyHealthScoreChanges, type HealthScoreChange } from '@/lib/notifications/notification-creators';
import type { ScreenerRow } from '@/app/api/screener/route';

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

export interface TwelveDataStatisticsRaw {
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
      day_50_ma?: number | null;
      day_200_ma?: number | null;
    };
    dividends_and_splits?: {
      forward_annual_dividend_yield?: number | null;
      trailing_annual_dividend_yield?: number | null;
      dividend_date?: string | null;
      payout_ratio?: number | null;
    };
    financials?: {
      profit_margin?: number | null;
      income_statement?: {
        revenue_ttm?: number | null;
        diluted_eps_ttm?: number | null;
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
    day50_ma: sp.day_50_ma ?? null,
    day200_ma: sp.day_200_ma ?? null,
    dividend_yield: sanitizeDividendYield(d),
    payout_ratio: d.payout_ratio ?? null,
    profit_margin: f.profit_margin ?? null,
    revenue_ttm: fi.revenue_ttm ? Math.round(fi.revenue_ttm) : null,
    eps_ttm: fi.diluted_eps_ttm ?? null,
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
    dividendYield: sanitizeDividendYield(d),
    profitMargin: f.profit_margin ?? null,
    revenueGrowthTTM: fi.quarterly_revenue_growth ?? null,
    epsGrowthTTM: fi.quarterly_earnings_growth_yoy ?? null,
  };
}

/**
 * Read one symbol's quarterly financials from the shared market_data_cache.
 *
 * Cache-only by design — see this file's header comment. Fresh entries are
 * preferred; an expired entry is still used rather than discarded, because a
 * quarter-old balance sheet computes a far better health score than no balance
 * sheet at all, and the alternative (fetching) is what caused the incident.
 * Nothing here costs a TwelveData credit, so no budget reservation is needed
 * and none of these reads can contribute to a rate-limit breach.
 *
 * `degraded` means we have no data at all for at least one statement, i.e.
 * ?phase=financials hasn't reached this symbol yet. The caller keeps that
 * ticker's previously persisted health score in that case.
 */
async function readCachedFinancials(sym: string): Promise<{
  income: IncomeStatementPeriod[];
  balance: BalanceSheetPeriod[];
  cashflow: CashFlowPeriod[];
  degraded: boolean;
}> {
  async function read<T>(key: string): Promise<T[] | null> {
    const fresh = await getCached<T[]>(key);
    if (fresh) return fresh;
    return await getCachedStale<T[]>(key);
  }

  const [income, balance, cashflow] = await Promise.all([
    read<IncomeStatementPeriod>(`financials:${sym}:income:quarterly`),
    read<BalanceSheetPeriod>(`financials:${sym}:balance:quarterly`),
    read<CashFlowPeriod>(`financials:${sym}:cashflow:quarterly`),
  ]);

  return {
    income: income ?? [],
    balance: balance ?? [],
    cashflow: cashflow ?? [],
    degraded: !income || !balance || !cashflow,
  };
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

  // Skip tickers whose screener_stats row was written within the last 12h —
  // the documented /statistics cache TTL (see CLAUDE.md's credit-costs table).
  // Without this, the 22:00/03:00 active-universe crons unconditionally
  // refetch every SIGNIFICANT_TICKERS symbol that cron-prefetch-market-data.yml
  // (05:00 UTC) already refreshed hours earlier — same ~530 large-cap tickers,
  // same endpoint, same table, for data that can't have meaningfully changed.
  // A ticker missing from screener_stats entirely (no row yet) has no
  // updated_at to match against, so first-time fetches are never skipped.
  const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
  const { data: freshStatsRows } = await supabase
    .from('screener_stats')
    .select('ticker')
    .in('ticker', uniqueSymbols)
    .gt('updated_at', twelveHoursAgo);
  const freshSet = new Set((freshStatsRows ?? []).map((r) => (r as { ticker: string }).ticker));
  const symbolsToFetch = uniqueSymbols.filter((s) => !freshSet.has(s));
  if (symbolsToFetch.length === 0) return [];

  // Company metadata (name / sector / industry / logo) for all symbols in one query.
  const { data: companies } = await supabase
    .from('companies')
    .select('ticker, name, sector, industry, logo_url')
    .in('ticker', symbolsToFetch);
  const companyMap = new Map(
    (companies ?? []).map((c) => [(c as { ticker: string }).ticker, c as {
      ticker: string; name: string | null; sector: string | null; industry: string | null; logo_url: string | null;
    }])
  );

  const rows: ScreenerRow[] = [];
  const degradedSymbols = new Set<string>();

  for (const group of chunk(symbolsToFetch, CHUNK_SIZE)) {
    await waitForCronCreditBudget(group.length * CREDITS_PER_STATS_SYMBOL);

    const requests: Record<string, string> = {};
    for (const sym of group) {
      requests[sym] = `/statistics?symbol=${encodeURIComponent(sym)}&apikey=${apiKey}`;
    }
    const raw = await batchFetch<TwelveDataStatisticsRaw>(requests);

    // Pure cache reads (see readCachedFinancials) — zero TwelveData credits,
    // so these can safely fan out. The sequential loop this replaced existed
    // only to stagger live fundamentals fetches against the credit budget;
    // with no fetching left to pace, there is nothing to stagger.
    const financialsMap = new Map<string, Awaited<ReturnType<typeof readCachedFinancials>>>(
      await Promise.all(
        group.map(async (sym) => [sym, await readCachedFinancials(sym)] as const)
      )
    );

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
      // non-degraded financials AND a real fiscal quarter identifier. This
      // overwrites the row for the current quarter (see health-score-history.ts)
      // so it stays in sync whether this cron or a user visiting the stock page
      // computed it most recently.
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

  // Read prior scores for every fetched symbol — used both to restore a
  // degraded fetch's health score (below) and to detect real grade changes
  // (e.g. B → C) worth notifying holders/watchers about. A single query
  // covers both uses instead of the degraded-only lookup this replaced.
  if (rows.length > 0) {
    const { data: priorRows } = await supabase
      .from('screener_stats')
      .select('ticker, health_score, health_score_grade')
      .in('ticker', rows.map((r) => r.ticker));
    const priorMap = new Map(
      (priorRows ?? []).map((r) => [(r as { ticker: string }).ticker, r as { health_score: number | null; health_score_grade: string | null }])
    );

    const gradeChanges: HealthScoreChange[] = [];

    for (const row of rows) {
      const prior = priorMap.get(row.ticker);

      // For symbols whose financials fetch was rate-limited/errored (even after
      // retry), the freshly-computed health score is unreliable — restore the
      // previously persisted score instead of overwriting a good one with a
      // falsely low one. Degraded rows never count as a real grade change.
      if (degradedSymbols.has(row.ticker)) {
        if (prior && prior.health_score != null) {
          row.health_score = prior.health_score;
          row.health_score_grade = prior.health_score_grade as ScreenerRow['health_score_grade'];
        }
        continue;
      }

      if (
        prior?.health_score_grade != null &&
        row.health_score_grade != null &&
        prior.health_score_grade !== row.health_score_grade
      ) {
        gradeChanges.push({
          symbol: row.ticker,
          oldGrade: prior.health_score_grade,
          newGrade: row.health_score_grade,
          oldScore: prior.health_score ?? 0,
          newScore: row.health_score ?? 0,
        });
      }
    }

    // Fire-and-forget: notifying holders/watchers must never fail or slow
    // down the screener refresh itself.
    if (gradeChanges.length > 0) {
      void notifyHealthScoreChanges(gradeChanges).catch((err) =>
        console.error('[screener-stats] health-score notification fan-out failed:', err)
      );
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
