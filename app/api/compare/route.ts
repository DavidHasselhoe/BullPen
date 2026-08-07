import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import { getStorageLogoUrl } from '@/lib/logos/logos-storage';
import { getCached, getCachedStale, setCached } from '@/lib/cache/market-data-cache';
import {
  getIncomeStatement,
  getBalanceSheet,
  getCashFlow,
  withRateLimitRetry,
  TwelveDataRateLimitError,
} from '@/lib/twelvedata/twelvedata-client';
import { tryReserveCredits } from '@/lib/twelvedata/credit-budget';

const FINANCIALS_CACHE_TTL_SECONDS = 24 * 60 * 60;
/** Real measured cost per statement (income/balance/cashflow), not the ~1
 *  credit CLAUDE.md's table used to assume — see its "Credit costs at a
 *  glance" section. A cold 5-company comparison fans out to 15 of these in
 *  one request: 1,515 credits against an account-wide cap of 610/min.
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
  fetcher: () => Promise<T>
): Promise<T> {
  const cacheKey = `financials:${ticker}:${type}:annual`;
  const cached = await getCached<T>(cacheKey);
  if (cached) return cached;

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

export const dynamic = 'force-dynamic';

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

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const tickersParam = sp.get('tickers');
    const tickers = tickersParam
      ? tickersParam.split(',').map((t) => t.trim().toUpperCase()).filter(Boolean)
      : [];

    if (tickers.length < 2 || tickers.length > 5) {
      return NextResponse.json(
        { success: false, error: 'Provide 2–5 comma-separated tickers, e.g. ?tickers=NVDA,AMD' },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    const { data: companies, error: companiesError } = await supabase
      .from('companies')
      .select('ticker, name, sector, industry, description, logo_url, employee_count, fiscal_year_end, sic_code, incorporation_location')
      .in('ticker', tickers);

    if (companiesError) {
      return NextResponse.json(
        { success: false, error: 'Could not fetch companies' },
        { status: 500 }
      );
    }

    const companyByTicker = new Map(((companies ?? []) as CompanyRow[]).map((c) => [c.ticker, c]));

    const results = await Promise.all(
      tickers.map(async (ticker): Promise<CompareCompany | null> => {
        const [income, balance, cashflow] = await Promise.all([
          getCachedFinancial(ticker, 'income', () => getIncomeStatement(ticker, 'annual', 4)),
          getCachedFinancial(ticker, 'balance', () => getBalanceSheet(ticker, 'annual', 4)),
          getCachedFinancial(ticker, 'cashflow', () => getCashFlow(ticker, 'annual', 4)),
        ]);

        if (income.length === 0) return null;

        const c = companyByTicker.get(ticker);
        const latest = income[0];
        const prev = income[1];
        const latestBalance = balance[0];
        const latestCashflow = cashflow[0];

        const rev = latest.revenue;
        const prevRev = prev?.revenue ?? null;
        const revenueGrowth =
          rev != null && prevRev != null && prevRev !== 0
            ? ((rev - prevRev) / Math.abs(prevRev)) * 100
            : null;

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

        return {
          ticker,
          name: c?.name ?? ticker,
          sector: c?.sector ?? null,
          industry: c?.industry ?? null,
          description: c?.description ?? null,
          logo_url: c?.logo_url || getStorageLogoUrl(ticker),
          employee_count: c?.employee_count ?? null,
          fiscal_year_end: c?.fiscal_year_end ?? null,
          sic_code: c?.sic_code ?? null,
          incorporation_location: c?.incorporation_location ?? null,
          metrics: {
            revenue: rev,
            grossProfit: latest.gross_profit,
            grossMargin: rev && latest.gross_profit != null ? (latest.gross_profit / rev) * 100 : null,
            operatingIncome: latest.operating_income,
            operatingMargin: rev && latest.operating_income != null ? (latest.operating_income / rev) * 100 : null,
            netIncome: latest.net_income,
            netMargin: rev && latest.net_income != null ? (latest.net_income / rev) * 100 : null,
            epsDiluted: latest.eps_diluted,
            freeCashFlow: latestCashflow?.free_cash_flow ?? null,
            totalAssets: latestBalance?.total_assets ?? null,
            shareholdersEquity: latestBalance?.total_stockholders_equity ?? null,
            revenueGrowth,
          },
          history,
        };
      }),
    );

    const successfulResults = results.filter((r): r is CompareCompany => r !== null);

    if (successfulResults.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Could not fetch data for any of the requested companies' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      companies: successfulResults,
    });
  } catch (err) {
    // Transient (already retried once in getCachedFinancial) and unrelated to plan
    // tier, so keep it distinct from the real plan_restricted case below.
    if (err instanceof TwelveDataRateLimitError) {
      return NextResponse.json({ success: false, error: 'rate_limited' }, { status: 200 });
    }
    const msg = err instanceof Error ? err.message : String(err);
    if (/enterprise plan|higher plan|not available.*plan/i.test(msg)) {
      return NextResponse.json({ success: false, error: 'plan_restricted' }, { status: 200 });
    }
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
