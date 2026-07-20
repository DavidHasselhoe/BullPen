import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import { getStorageLogoUrl } from '@/lib/logos/logos-storage';
import { getIncomeStatement, getBalanceSheet, getCashFlow, TwelveDataRateLimitError } from '@/lib/twelvedata/twelvedata-client';

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
          getIncomeStatement(ticker, 'annual', 4),
          getBalanceSheet(ticker, 'annual', 4),
          getCashFlow(ticker, 'annual', 4),
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
    if (err instanceof TwelveDataRateLimitError) {
      return NextResponse.json({ success: false, error: 'plan_restricted' }, { status: 200 });
    }
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
