import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import { withRateLimit } from '@/lib/security/api-security';

export const dynamic = 'force-dynamic';

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
  dividend_yield: number | null;
  payout_ratio: number | null;
  week52_high: number | null;
  week52_low: number | null;
  day50_ma: number | null;
  day200_ma: number | null;
  updated_at: string;
}

function parseNum(val: string | null): number | undefined {
  if (val == null) return undefined;
  const n = parseFloat(val);
  return isFinite(n) ? n : undefined;
}

function inRange(value: number | null, min: number | undefined, max: number | undefined): boolean {
  if (value == null) return min == null && max == null;
  if (min != null && value < min) return false;
  if (max != null && value > max) return false;
  return true;
}

async function handler(request: NextRequest) {
  const supabase = createServerClient();
  const sp = request.nextUrl.searchParams;

  // --- Parse filter params ---
  const sector = sp.get('sector') || undefined;
  const industry = sp.get('industry') || undefined;
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

  // Fetch all cached stats
  const { data, error } = await supabase
    .from('screener_stats')
    .select('*')
    .order('market_cap', { ascending: false, nullsFirst: false });

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  let results: ScreenerRow[] = (data ?? []) as ScreenerRow[];

  // --- Apply filters ---
  results = results.filter((r) => {
    if (sector && r.sector !== sector) return false;
    if (industry && r.industry !== industry) return false;

    // Market cap: client sends billions, DB stores raw (e.g. 3e12 for $3T)
    if (!inRange(r.market_cap, marketCapMin, marketCapMax)) return false;
    if (!inRange(r.pe_ratio, peMin, peMax)) return false;
    if (!inRange(r.pb_ratio, pbMin, pbMax)) return false;
    if (!inRange(r.beta, betaMin, betaMax)) return false;
    if (!inRange(r.dividend_yield, divYieldMin, divYieldMax)) return false;

    // Profit margin stored as 0..1, filter in percent (0..100)
    const profitMarginPct = r.profit_margin != null ? r.profit_margin * 100 : null;
    if (!inRange(profitMarginPct, profitMarginMin, profitMarginMax)) return false;

    if (!inRange(r.revenue_growth_yoy, revenueGrowthMin, revenueGrowthMax)) return false;

    // 52-week range relative to 52w high (how far below high, as %)
    if ((week52ChangeMin != null || week52ChangeMax != null) && r.week52_high && r.week52_low) {
      const range52Pct = ((r.week52_high - r.week52_low) / r.week52_high) * 100;
      if (!inRange(range52Pct, week52ChangeMin, week52ChangeMax)) return false;
    }

    return true;
  });

  // Collect unique sectors and industries for filter dropdowns
  const sectors = [...new Set(
    (data ?? []).map((r) => (r as ScreenerRow).sector).filter(Boolean) as string[]
  )].sort();

  const allRows = (data ?? []) as ScreenerRow[];
  const sectorFilter = sector;
  const industriesSource = sectorFilter
    ? allRows.filter(r => r.sector === sectorFilter)
    : allRows;
  const industries = [...new Set(
    industriesSource.map(r => r.industry).filter(Boolean) as string[]
  )].sort();

  const response = NextResponse.json({
    success: true,
    results,
    sectors,
    industries,
    total: results.length,
    stale: (data ?? []).length === 0,
  });
  response.headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=60');
  return response;
}

// 30 req/min
export const GET = withRateLimit(handler, { windowMs: 60_000, maxRequests: 30 });
