import { createServerClient } from '@/lib/supabase/client';
import { getLogoManifest, logoUrlFromManifest } from '@/lib/logos/logo-manifest';
import { getCached, getCachedStale, setCached } from '@/lib/cache/market-data-cache';
import {
  getIncomeStatement,
  getBalanceSheet,
  getCashFlow,
  withRateLimitRetry,
  type IncomeStatementPeriod,
  type BalanceSheetPeriod,
  type CashFlowPeriod,
} from '@/lib/twelvedata/twelvedata-client';
import { tryReserveCredits } from '@/lib/twelvedata/credit-budget';
import { statementsInUsd } from '@/lib/currency/latest-rates';
import type { StatementFx } from '@/lib/currency/statement-fx';
import { getDisplayNames } from '@/lib/market-data/display-names';

const FINANCIALS_CACHE_TTL_SECONDS = 24 * 60 * 60;
/** Real measured cost per statement (income/balance/cashflow), not the ~1
 *  credit CLAUDE.md's table used to assume — see its "Credit costs at a
 *  glance" section. A cold 5-company comparison fans out to 15 of these:
 *  1,515 credits against an account-wide cap of 610/min.
 *
 *  This used to call waitForCronCreditBudget, which proceeds anyway once its
 *  wait elapses. Because all 15 fetches are fired concurrently via Promise.all
 *  they raced the same budget, at most three could win, and the rest gave up
 *  in lockstep and fired unreserved about 8 seconds later — the whole 1,515
 *  credits landing inside one minute while the budget bucket recorded ~300.
 *  That is the same mechanism that produced the repeated cron spikes (see
 *  lib/market-data/screener-stats.ts), and a soft guard cannot fix it: a
 *  swarm of concurrent waiters always gives up together.
 *
 *  tryReserveCredits skips instead, so an unreservable statement degrades to
 *  cached data rather than contributing to a breach. */
const CREDITS_PER_STATEMENT = 101;
const BUDGET_WAIT_MS = 8_000;

/**
 * Cache key format matches /api/stock/[ticker]/financials so a comparison and a
 * stock detail page visit share the same warm entry instead of double-fetching.
 */
async function getCachedFinancial<T>(
  ticker: string,
  type: 'income' | 'balance' | 'cashflow',
  fetcher: () => Promise<T>,
  cacheOnly: boolean
): Promise<T> {
  const cacheKey = `financials:${ticker}:${type}:annual`;
  const cached = await getCached<T>(cacheKey);
  if (cached) return cached;
  // Crawled pages never spend credits: an expired entry or nothing at all.
  if (cacheOnly) return (await getCachedStale<T>(cacheKey)) ?? ([] as unknown as T);

  // Never fetch without a granted reservation. Falling back to an expired
  // entry shows a comparison built on slightly older annual statements, which
  // is a far better outcome than a burst that rate-limits the whole account
  // for everyone. Annual figures change four times a year, so "stale" here is
  // typically hours old, not meaningfully different.
  if (!(await tryReserveCredits(CREDITS_PER_STATEMENT, BUDGET_WAIT_MS))) {
    const stale = await getCachedStale<T>(cacheKey);
    // Every caller passes an array fetcher and treats an empty income
    // statement as "omit this company from the comparison", which is the
    // correct outcome when we have nothing cached and cannot afford a fetch.
    return stale ?? ([] as unknown as T);
  }

  const result = await withRateLimitRetry(fetcher);
  if (Array.isArray(result) ? result.length > 0 : !!result) {
    void setCached(cacheKey, ticker, 'financials', result, FINANCIALS_CACHE_TTL_SECONDS);
  }
  return result;
}

/**
 * "Current" comparison metrics built from the last 4 cached quarters instead
 * of a live annual fetch. This reads the exact cache keys the nightly
 * prefetch-financials cron (~1,400 tickers) and the stock page's financials
 * tab (default period) both write — `financials:<ticker>:<type>:quarterly` —
 * so for any ticker either of those has already touched, this is a free
 * Supabase read instead of the ~303 credits/company a cold annual fetch
 * costs. A 5-company comparison used to be able to fan out to 1,515 credits
 * in one request; this is the fix for that.
 *
 * Income/cash-flow figures are trailing-twelve-month sums of the 4 quarters
 * (standard TTM). Balance-sheet figures use only the most recent quarter —
 * a balance sheet is a point-in-time snapshot, not something that sums
 * across periods, and the latest quarter-end is a fresher number than the
 * latest annual filing anyway.
 *
 * revenueGrowth is left null here: a clean TTM-over-TTM figure needs 8
 * quarters (this cache only ever holds 4). The caller fills it from the
 * annual history, labelled as the latest fiscal year.
 *
 * A TTM sum is only a sum when all 4 quarters have the value. Skipping a
 * missing quarter once showed AAPL's EPS as $6.87 (3 quarters) beside a
 * fiscal-year $8.98, so any gap makes that metric null instead.
 *
 * Returns null if any statement has fewer periods than expected — that's
 * either a genuinely cold cache or a company too newly public to have 4
 * quarters of history, and the caller falls back to the guarded annual
 * fetch in both cases rather than show a partial TTM mislabeled as whole.
 */
function buildTtmMetrics(
  income: IncomeStatementPeriod[] | null,
  balance: BalanceSheetPeriod[] | null,
  cashflow: CashFlowPeriod[] | null
): CompareCompany['metrics'] | null {
  if (!income || income.length < 4 || !cashflow || cashflow.length < 4 || !balance || balance.length === 0) {
    return null;
  }

  // Newest four only: the cache is written newest first and could hold more.
  income = income.slice(0, 4);
  cashflow = cashflow.slice(0, 4);
  const sum = (values: Array<number | null>): number | null =>
    values.every((v): v is number => v != null) ? values.reduce((a, b) => a + b, 0) : null;

  const rev = sum(income.map((p) => p.revenue));
  const grossProfit = sum(income.map((p) => p.gross_profit));
  const operatingIncome = sum(income.map((p) => p.operating_income));
  const netIncome = sum(income.map((p) => p.net_income));
  const epsDiluted = sum(income.map((p) => p.eps_diluted));
  const freeCashFlow = sum(cashflow.map((p) => p.free_cash_flow));
  const latestBalance = balance[0];

  return {
    revenue: rev,
    grossProfit,
    grossMargin: rev && grossProfit != null ? (grossProfit / rev) * 100 : null,
    operatingIncome,
    operatingMargin: rev && operatingIncome != null ? (operatingIncome / rev) * 100 : null,
    netIncome,
    netMargin: rev && netIncome != null ? (netIncome / rev) * 100 : null,
    epsDiluted,
    freeCashFlow,
    totalAssets: latestBalance.total_assets,
    shareholdersEquity: latestBalance.total_stockholders_equity,
    revenueGrowth: null,
  };
}

export interface CompareCompany {
  ticker: string;
  name: string;
  sector: string | null;
  industry: string | null;
  description: string | null;
  logo_url: string | null;
  employee_count: number | null;
  fiscal_year_end: string | null;
  sic_code: string | null;
  incorporation_location: string | null;
  /** Set when the statements were converted to USD from the company's own currency (TSM's TWD). */
  fx: StatementFx | null;
  /** Which period `metrics` covers, so the page can say so: the 12 months to a
   *  quarter-end date, or one fiscal year. Balance-sheet items are the latest
   *  period-end either way. */
  metricsBasis: { kind: 'ttm'; through: string } | { kind: 'fy'; year: number } | null;
  /** Fiscal year `metrics.revenueGrowth` measures, against the year before. */
  growthYear: number | null;
  /** Price-side figures from screener_stats (refreshed daily, no TwelveData call here). */
  market: {
    healthScore: number | null;
    healthGrade: string | null;
    peRatio: number | null;
    /** Fraction: 0.0075 is 0.75%. */
    dividendYield: number | null;
    marketCap: number | null;
  } | null;
  metrics: {
    revenue: number | null;
    grossProfit: number | null;
    grossMargin: number | null;
    operatingIncome: number | null;
    operatingMargin: number | null;
    netIncome: number | null;
    netMargin: number | null;
    epsDiluted: number | null;
    freeCashFlow: number | null;
    totalAssets: number | null;
    shareholdersEquity: number | null;
    revenueGrowth: number | null;
  };
  history: Array<{
    period: string;
    fiscalYear: number;
    revenue: number | null;
    grossProfit: number | null;
    netIncome: number | null;
    epsDiluted: number | null;
    freeCashFlow: number | null;
  }>;
}

interface CompanyRow {
  ticker: string;
  name: string;
  sector: string | null;
  industry: string | null;
  description: string | null;
  logo_url: string | null;
  employee_count: number | null;
  fiscal_year_end: string | null;
  sic_code: string | null;
  incorporation_location: string | null;
}

/**
 * Fetches one company's full Compare payload (profile + current metrics +
 * financial history). Shared by both the batched (/api/compare) and
 * single-ticker (/api/compare/company) routes so the two never drift.
 * Returns null when there's no financial data available at all (a company
 * BullPen doesn't cover), which callers treat as "omit from the comparison."
 */
export async function fetchCompareCompany(
  ticker: string,
  { cacheOnly = false }: { cacheOnly?: boolean } = {}
): Promise<CompareCompany | null> {
  const supabase = createServerClient();
  // cacheOnly (the crawlable /tools/compare/[pair] pages) also accepts expired
  // quarterly entries, since it will never fetch a fresh one.
  const readQuarterly = cacheOnly ? getCachedStale : getCached;

  const [{ data: companyRow }, quarterlyIncome, quarterlyBalance, quarterlyCashflow, logoManifest, displayNames, { data: marketRow }, { data: descriptionRow }] = await Promise.all([
    supabase
      .from('companies')
      .select('ticker, name, sector, industry, description, logo_url, employee_count, fiscal_year_end, sic_code, incorporation_location')
      .eq('ticker', ticker)
      .maybeSingle<CompanyRow>(),
    // Prefer the nightly-cron-warmed quarterly cache for "current" metrics —
    // a pure Supabase read, zero TwelveData cost. See buildTtmMetrics above.
    readQuarterly<IncomeStatementPeriod[]>(`financials:${ticker}:income:quarterly`),
    readQuarterly<BalanceSheetPeriod[]>(`financials:${ticker}:balance:quarterly`),
    readQuarterly<CashFlowPeriod[]>(`financials:${ticker}:cashflow:quarterly`),
    // Cached/memoized (see logo-manifest.ts) — not a per-request Supabase hit.
    getLogoManifest(),
    // companies.name is SEC style ("MICROSOFT CORP"); this gives "Microsoft".
    getDisplayNames([ticker]),
    supabase
      .from('screener_stats')
      .select('health_score, health_score_grade, pe_ratio, dividend_yield, market_cap')
      .eq('ticker', ticker)
      .maybeSingle<{ health_score: number | null; health_score_grade: string | null; pe_ratio: number | null; dividend_yield: number | null; market_cap: number | null }>(),
    // companies.description is empty for most large caps; the profile text lives here (mig 199).
    supabase.from('company_descriptions').select('description').eq('ticker', ticker).maybeSingle<{ description: string | null }>(),
  ]);

  // The cache keeps rows in the filer's currency and everything here is shown
  // in dollars, so convert on the way out as the Financials card does.
  let fx: StatementFx | null = null;
  const inUsd = async <T extends object>(rows: T[]): Promise<T[]> => {
    const out = await statementsInUsd(ticker, rows);
    fx ??= out.fx;
    return out.rows;
  };

  const qIncome = quarterlyIncome && (await inUsd(quarterlyIncome));
  const qBalance = quarterlyBalance && (await inUsd(quarterlyBalance));
  const qCashflow = quarterlyCashflow && (await inUsd(quarterlyCashflow));

  // Financial History always needs real annual periods — a quarterly cache
  // only ever holds the last 4 quarters, not a multi-year trend. Balance
  // sheet was never used in history, only in metrics, so this is 2 guarded
  // statements instead of 3 regardless of which path metrics took below.
  const [income, cashflow] = await Promise.all([
    getCachedFinancial(ticker, 'income', () => getIncomeStatement(ticker, 'annual', 4), cacheOnly).then(inUsd),
    getCachedFinancial(ticker, 'cashflow', () => getCashFlow(ticker, 'annual', 4), cacheOnly).then(inUsd),
  ]);

  // When the last 4 quarters end on the fiscal year-end (AAPL in November),
  // the last 12 months ARE the latest fiscal year: use the filed annual
  // figures, so the metrics match the history table exactly and a quarter
  // missing from the cache cannot blank a metric.
  const ttmIsLatestYear = !!qIncome?.[0] && qIncome[0].fiscal_date === income[0]?.fiscal_date;
  const ttmMetrics = ttmIsLatestYear ? null : buildTtmMetrics(qIncome, qBalance, qCashflow);

  if (income.length === 0 && !ttmMetrics) return null;

  const history = income.map((r, i) => {
    const fiscalYear = Number(r.fiscal_date.slice(0, 4));
    return {
      period: `FY${fiscalYear}`,
      fiscalYear,
      revenue: r.revenue,
      grossProfit: r.gross_profit,
      netIncome: r.net_income,
      epsDiluted: r.eps_diluted,
      freeCashFlow: cashflow[i]?.free_cash_flow ?? null,
    };
  });

  // Latest fiscal year vs the year before, from the annual history both paths
  // have (the TTM path has no prior-year TTM to compare against).
  const latestRev = income[0]?.revenue ?? null;
  const prevRev = income[1]?.revenue ?? null;
  const revenueGrowth =
    latestRev != null && prevRev != null && prevRev !== 0
      ? ((latestRev - prevRev) / Math.abs(prevRev)) * 100
      : null;
  const growthYear = revenueGrowth != null ? history[0].fiscalYear : null;

  let metrics: CompareCompany['metrics'];
  let metricsBasis: CompareCompany['metricsBasis'];
  if (ttmMetrics) {
    metrics = { ...ttmMetrics, revenueGrowth };
    metricsBasis = { kind: 'ttm', through: qIncome![0].fiscal_date };
  } else {
    // Quarterly cache was cold (a ticker outside the ~1,400-ticker
    // cron-covered universe) — same guarded annual fetch as before, only
    // reached for that minority of tickers. When the latest quarter IS the
    // fiscal year-end, its cached balance sheet is the year-end one: no fetch.
    const balance = ttmIsLatestYear && qBalance?.[0]?.fiscal_date === income[0].fiscal_date
      ? qBalance
      : await getCachedFinancial(ticker, 'balance', () => getBalanceSheet(ticker, 'annual', 4), cacheOnly).then(inUsd);
    const latest = income[0];
    const latestBalance = balance[0];
    const latestCashflow = cashflow[0];
    const rev = latest?.revenue ?? null;
    metricsBasis = history[0] ? { kind: 'fy', year: history[0].fiscalYear } : null;

    metrics = {
      revenue: rev,
      grossProfit: latest?.gross_profit ?? null,
      grossMargin: rev && latest?.gross_profit != null ? (latest.gross_profit / rev) * 100 : null,
      operatingIncome: latest?.operating_income ?? null,
      operatingMargin: rev && latest?.operating_income != null ? (latest.operating_income / rev) * 100 : null,
      netIncome: latest?.net_income ?? null,
      netMargin: rev && latest?.net_income != null ? (latest.net_income / rev) * 100 : null,
      epsDiluted: latest?.eps_diluted ?? null,
      freeCashFlow: latestCashflow?.free_cash_flow ?? null,
      totalAssets: latestBalance?.total_assets ?? null,
      shareholdersEquity: latestBalance?.total_stockholders_equity ?? null,
      revenueGrowth,
    };
  }

  return {
    ticker,
    name: displayNames.get(ticker) ?? companyRow?.name ?? ticker,
    sector: companyRow?.sector ?? null,
    industry: companyRow?.industry ?? null,
    description: descriptionRow?.description || companyRow?.description || null,
    // getStorageLogoUrl always guessed a .jpg URL regardless of the real
    // stored extension (png/svg get uploaded too — see uploadLogoToStorage),
    // so any ticker whose logo isn't a jpg 404'd here and fell through to
    // CompanyLogo's initials fallback even though a real logo existed one
    // request away at /api/logo/[ticker]. The manifest tracks the real
    // extension per ticker; null (no bucket object yet) correctly defers to
    // that self-healing proxy instead of emitting a second wrong guess.
    logo_url: companyRow?.logo_url || logoUrlFromManifest(logoManifest, ticker),
    employee_count: companyRow?.employee_count ?? null,
    fiscal_year_end: companyRow?.fiscal_year_end ?? null,
    sic_code: companyRow?.sic_code ?? null,
    incorporation_location: companyRow?.incorporation_location ?? null,
    fx,
    metricsBasis,
    growthYear,
    market: marketRow
      ? {
          healthScore: marketRow.health_score,
          healthGrade: marketRow.health_score_grade,
          peRatio: marketRow.pe_ratio,
          dividendYield: marketRow.dividend_yield,
          marketCap: marketRow.market_cap,
        }
      : null,
    metrics,
    history,
  };
}
