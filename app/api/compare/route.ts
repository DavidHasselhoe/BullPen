import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import { getStorageLogoUrl } from '@/lib/logos/logos-storage';

export const dynamic = 'force-dynamic';

const COMPARE_METRICS = [
  'revenue',
  'gross_profit',
  'operating_income',
  'net_income',
  'eps_diluted',
  'free_cash_flow',
  'total_assets',
  'shareholders_equity',
] as const;

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
      .select('id, ticker, name, sector, industry, description, logo_url, employee_count, fiscal_year_end, sic_code, incorporation_location')
      .in('ticker', tickers);

    if (companiesError || !companies?.length) {
      return NextResponse.json(
        { success: false, error: 'Could not fetch companies' },
        { status: 500 }
      );
    }

    const companyMap = new Map((companies as { id: string; ticker: string }[]).map((c) => [c.ticker, c.id]));
    const companyIds = Array.from(companyMap.values());

    const { data: metricsRows, error: metricsError } = await supabase
      .from('financial_metrics')
      .select('company_id, metric_type, value, fiscal_year, fiscal_quarter, period_type')
      .in('company_id', companyIds)
      .in('metric_type', [...COMPARE_METRICS])
      .eq('period_type', 'annual')
      .order('fiscal_year', { ascending: false });

    if (metricsError) {
      return NextResponse.json(
        { success: false, error: 'Could not fetch metrics' },
        { status: 500 }
      );
    }

    const idToTicker = new Map<string, string>();
    for (const [t, id] of companyMap) {
      idToTicker.set(id, t);
    }

    type MetricsRow = { company_id: string; metric_type: string; value: number | null; fiscal_year: number; fiscal_quarter?: number };
    const rows = (metricsRows ?? []) as MetricsRow[];

    const byCompanyYear: Record<string, Record<number, Record<string, number | null>>> = {};
    for (const r of rows) {
      const ticker = idToTicker.get(r.company_id);
      if (!ticker) continue;
      if (!byCompanyYear[ticker]) byCompanyYear[ticker] = {};
      if (!byCompanyYear[ticker][r.fiscal_year]) byCompanyYear[ticker][r.fiscal_year] = {};
      byCompanyYear[ticker][r.fiscal_year][r.metric_type] = r.value;
    }

    const companiesData = companies as Array<{
      id: string;
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
    }>;

    const results: CompareCompany[] = [];
    const orderedTickers = tickers.filter((t) => companyMap.has(t));

    for (const ticker of orderedTickers) {
      const c = companiesData.find((x) => x.ticker === ticker);
      if (!c) continue;

      const years = Object.keys(byCompanyYear[ticker] ?? {})
        .map(Number)
        .sort((a, b) => b - a)
        .slice(0, 4);
      const latestYear = years[0];
      const prevYear = years[1];
      const latest = byCompanyYear[ticker]?.[latestYear] ?? {};
      const prev = byCompanyYear[ticker]?.[prevYear] ?? {};
      const rev = (latest.revenue ?? null) as number | null;
      const prevRev = (prev.revenue ?? null) as number | null;
      const grossProfit = (latest.gross_profit ?? null) as number | null;
      const opIncome = (latest.operating_income ?? null) as number | null;
      const netIncome = (latest.net_income ?? null) as number | null;

      const revenueGrowth =
        rev != null && prevRev != null && prevRev !== 0
          ? ((rev - prevRev) / Math.abs(prevRev)) * 100
          : null;

      const history = years.map((fy) => {
        const y = byCompanyYear[ticker]?.[fy] ?? {};
        const yr = (y.revenue ?? null) as number | null;
        const gp = (y.gross_profit ?? null) as number | null;
        const ni = (y.net_income ?? null) as number | null;
        const eps = (y.eps_diluted ?? null) as number | null;
        const fcf = (y.free_cash_flow ?? null) as number | null;
        return {
          period: `FY${fy}`,
          fiscalYear: fy,
          revenue: yr,
          grossProfit: gp,
          netIncome: ni,
          epsDiluted: eps,
          freeCashFlow: fcf,
        };
      });

      results.push({
        ticker: c.ticker,
        name: c.name,
        sector: c.sector,
        industry: c.industry,
        description: c.description,
        logo_url: c.logo_url || getStorageLogoUrl(c.ticker),
        employee_count: c.employee_count,
        fiscal_year_end: c.fiscal_year_end,
        sic_code: c.sic_code,
        incorporation_location: c.incorporation_location,
        metrics: {
          revenue: rev,
          grossProfit,
          grossMargin: rev && grossProfit != null ? (grossProfit / rev) * 100 : null,
          operatingIncome: opIncome,
          operatingMargin: rev && opIncome != null ? (opIncome / rev) * 100 : null,
          netIncome,
          netMargin: rev && netIncome != null ? (netIncome / rev) * 100 : null,
          epsDiluted: (latest.eps_diluted ?? null) as number | null,
          freeCashFlow: (latest.free_cash_flow ?? null) as number | null,
          totalAssets: (latest.total_assets ?? null) as number | null,
          shareholdersEquity: (latest.shareholders_equity ?? null) as number | null,
          revenueGrowth,
        },
        history,
      });
    }

    return NextResponse.json({
      success: true,
      companies: results,
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
