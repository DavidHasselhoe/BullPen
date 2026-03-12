import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import { withRateLimit } from '@/lib/security/api-security';

export const dynamic = 'force-dynamic';

interface RawRow {
  id: string;
  ticker: string;
  name: string;
  sector: string | null;
  industry: string | null;
  logo_url: string | null;
  revenue: number | null;
  gross_profit: number | null;
  operating_income: number | null;
  net_income: number | null;
  eps_diluted: number | null;
  total_assets: number | null;
  total_liabilities: number | null;
  shareholders_equity: number | null;
  free_cash_flow: number | null;
  prev_revenue: number | null;
}

export interface ScreenerRow {
  id: string;
  ticker: string;
  name: string;
  sector: string | null;
  industry: string | null;
  logo_url: string | null;
  revenue: number | null;
  grossMargin: number | null;
  operatingMargin: number | null;
  netMargin: number | null;
  epsDiluted: number | null;
  freeCashFlow: number | null;
  revenueGrowth: number | null;
  debtToEquity: number | null;
}

function deriveMetrics(row: RawRow): ScreenerRow {
  const rev = row.revenue;
  return {
    id: row.id,
    ticker: row.ticker,
    name: row.name,
    sector: row.sector,
    industry: row.industry,
    logo_url: row.logo_url,
    revenue: rev,
    grossMargin: rev && row.gross_profit != null ? (row.gross_profit / rev) * 100 : null,
    operatingMargin: rev && row.operating_income != null ? (row.operating_income / rev) * 100 : null,
    netMargin: rev && row.net_income != null ? (row.net_income / rev) * 100 : null,
    epsDiluted: row.eps_diluted,
    freeCashFlow: row.free_cash_flow,
    revenueGrowth:
      rev != null && row.prev_revenue != null && row.prev_revenue !== 0
        ? ((rev - row.prev_revenue) / Math.abs(row.prev_revenue)) * 100
        : null,
    debtToEquity:
      row.total_liabilities != null &&
      row.shareholders_equity != null &&
      row.shareholders_equity !== 0
        ? row.total_liabilities / row.shareholders_equity
        : null,
  };
}

function parseNum(val: string | null): number | undefined {
  if (val == null) return undefined;
  const n = parseFloat(val);
  return isFinite(n) ? n : undefined;
}

function inRange(
  value: number | null,
  min: number | undefined,
  max: number | undefined,
): boolean {
  if (value == null) return min == null && max == null;
  if (min != null && value < min) return false;
  if (max != null && value > max) return false;
  return true;
}

async function handler(request: NextRequest) {
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase.rpc('get_screener_data');

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    const sp = request.nextUrl.searchParams;
    const tickersParam = sp.get('tickers');
    const tickers = tickersParam
      ? tickersParam.split(',').map((t) => t.trim().toUpperCase()).filter(Boolean)
      : undefined;
    const sector = sp.get('sector') || undefined;
    const revenueMin = parseNum(sp.get('revenueMin'));
    const revenueMax = parseNum(sp.get('revenueMax'));
    const grossMarginMin = parseNum(sp.get('grossMarginMin'));
    const grossMarginMax = parseNum(sp.get('grossMarginMax'));
    const operatingMarginMin = parseNum(sp.get('operatingMarginMin'));
    const operatingMarginMax = parseNum(sp.get('operatingMarginMax'));
    const netMarginMin = parseNum(sp.get('netMarginMin'));
    const netMarginMax = parseNum(sp.get('netMarginMax'));
    const epsMin = parseNum(sp.get('epsMin'));
    const epsMax = parseNum(sp.get('epsMax'));
    const fcfMin = parseNum(sp.get('fcfMin'));
    const fcfMax = parseNum(sp.get('fcfMax'));
    const revenueGrowthMin = parseNum(sp.get('revenueGrowthMin'));
    const revenueGrowthMax = parseNum(sp.get('revenueGrowthMax'));
    const deMin = parseNum(sp.get('deMin'));
    const deMax = parseNum(sp.get('deMax'));

    let results: ScreenerRow[] = ((data as RawRow[]) || []).map(deriveMetrics);

    if (sector) {
      results = results.filter((r) => r.sector === sector);
    }

    // When tickers specified (e.g. from "compare NVDA and AMD"), show only those companies in order
    if (tickers && tickers.length > 0) {
      const tickerSet = new Set(tickers);
      results = results.filter((r) => tickerSet.has(r.ticker));
      results.sort((a, b) => tickers.indexOf(a.ticker) - tickers.indexOf(b.ticker));
    }

    results = results.filter((r) => {
      if (!inRange(r.revenue, revenueMin, revenueMax)) return false;
      if (!inRange(r.grossMargin, grossMarginMin, grossMarginMax)) return false;
      if (!inRange(r.operatingMargin, operatingMarginMin, operatingMarginMax)) return false;
      if (!inRange(r.netMargin, netMarginMin, netMarginMax)) return false;
      if (!inRange(r.epsDiluted, epsMin, epsMax)) return false;
      if (!inRange(r.freeCashFlow, fcfMin, fcfMax)) return false;
      if (!inRange(r.revenueGrowth, revenueGrowthMin, revenueGrowthMax)) return false;
      if (!inRange(r.debtToEquity, deMin, deMax)) return false;
      return true;
    });

    // Default sort: revenue descending
    results.sort((a, b) => (b.revenue ?? 0) - (a.revenue ?? 0));

    // Collect unique sectors for filter dropdown
    const sectors = [
      ...new Set(
        ((data as RawRow[]) || []).map((r) => r.sector).filter(Boolean) as string[],
      ),
    ].sort();

    const response = NextResponse.json({ success: true, results, sectors, total: results.length });
    response.headers.set('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=600');
    return response;
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}

// 20 req/min (heavier DB query; stricter limit)
export const GET = withRateLimit(handler, { windowMs: 60 * 1000, maxRequests: 20 });
