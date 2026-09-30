/**
 * The screener's universe loading and filter predicate, shared by the
 * /api/screener route and Bull's screenStocks tool so the two can never
 * disagree about what "health score 70+" or "S&P 500" matches.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ScreenerRow } from '@/app/api/screener/route';
import { SP500_TICKERS } from '@/lib/market-data/sp500';
import { isDuplicateShareClass } from '@/lib/market-data/dual-class-shares';

/** Every bound is optional. marketCap is raw USD here (the UI and Bull both speak billions and convert before calling). */
export interface ScreenerFilterParams {
  sector?: string;
  industry?: string;
  healthScoreMin?: number;
  healthScoreMax?: number;
  marketCapMin?: number;
  marketCapMax?: number;
  peMin?: number;
  peMax?: number;
  pbMin?: number;
  pbMax?: number;
  betaMin?: number;
  betaMax?: number;
  divYieldMin?: number;
  divYieldMax?: number;
  profitMarginMin?: number;
  profitMarginMax?: number;
  revenueGrowthMin?: number;
  revenueGrowthMax?: number;
  week52ChangeMin?: number;
  week52ChangeMax?: number;
}

/**
 * PostgREST caps an unbounded `select()` at 1000 rows and says nothing about
 * it. Three screener queries were silently truncating because of that: the
 * "All" view returned 997 of 3053 rows, the default active view 1000 of 1219,
 * and the `countOnly` query behind the "View all (N)" pill read 999. The first
 * two reached the Pro CSV/PDF export, so a paid file was quietly missing two
 * thirds of the universe, which is the worst way for a paid feature to fail.
 *
 * Callers must supply a stable sort. `market_cap` is not unique, so every call
 * site adds `ticker` as a tiebreaker to stop rows shifting between pages.
 */
const PAGE = 1000;

export async function fetchAllPages<T>(
  build: () => PromiseLike<{ data: T[] | null; error: { message: string } | null }> & {
    range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>;
  }
): Promise<{ rows: T[]; error: string | null }> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) return { rows, error: error.message };
    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAGE) return { rows, error: null };
  }
}

/**
 * Base rows for one screener view, ordered by market cap:
 *  - symbols: just those tickers (holdings / watchlist / custom views). Exempt
 *    from dual-class dedup, since a user may hold the non-canonical class.
 *  - 'sp500': the real index constituents.
 *  - 'all': every row in screener_stats.
 *  - 'active': the tier-1 actively-tracked universe via screener_active_rows(),
 *    so the on-demand/discovery long tail never bloats the default screen.
 */
export async function loadScreenerUniverse(
  supabase: SupabaseClient,
  opts: { symbols?: string[]; scope: 'sp500' | 'all' | 'active' },
): Promise<{ rows: ScreenerRow[]; error: string | null }> {
  if (opts.symbols && opts.symbols.length > 0) {
    const { data, error } = await supabase
      .from('screener_stats')
      .select('*')
      .in('ticker', opts.symbols)
      .order('market_cap', { ascending: false, nullsFirst: false });
    return { rows: (data ?? []) as ScreenerRow[], error: error?.message ?? null };
  }

  let result: { rows: ScreenerRow[]; error: string | null };
  if (opts.scope === 'sp500') {
    const { data, error } = await supabase
      .from('screener_stats')
      .select('*')
      .in('ticker', SP500_TICKERS)
      .order('market_cap', { ascending: false, nullsFirst: false });
    result = { rows: (data ?? []) as ScreenerRow[], error: error?.message ?? null };
  } else if (opts.scope === 'all') {
    result = await fetchAllPages<ScreenerRow>(() =>
      supabase
        .from('screener_stats')
        .select('*')
        .order('market_cap', { ascending: false, nullsFirst: false })
        .order('ticker', { ascending: true })
    );
  } else {
    result = await fetchAllPages<ScreenerRow>(() =>
      supabase
        .rpc('screener_active_rows')
        .order('market_cap', { ascending: false, nullsFirst: false })
        .order('ticker', { ascending: true })
    );
  }

  // Dual-class pairs (GOOG/GOOGL, FOX/FOXA, NWS/NWSA...) are both real index
  // constituents, so they both land in these broad universes. Collapse to one
  // row per company.
  return { rows: result.rows.filter((r) => !isDuplicateShareClass(r.ticker)), error: result.error };
}

function inRange(value: number | null, min: number | undefined, max: number | undefined): boolean {
  if (value == null) return min == null && max == null;
  if (min != null && value < min) return false;
  if (max != null && value > max) return false;
  return true;
}

/**
 * screener_stats stores dividend_yield/profit_margin/payout_ratio as
 * TwelveData's raw 0..1 fraction, but filter inputs are percent-scale
 * (0..100), see the matching comment in screener-columns.tsx. Route every
 * fraction-stored field's range check through this helper rather than
 * hand-writing `* 100`; that repetition is exactly how the dividend yield
 * filter (625cc70) and the identical payout-ratio display bug happened.
 */
function inRangeFractionAsPct(value: number | null, min: number | undefined, max: number | undefined): boolean {
  return inRange(value != null ? value * 100 : null, min, max);
}

export function matchesScreenerFilters(r: ScreenerRow, f: ScreenerFilterParams): boolean {
  if (f.sector && r.sector !== f.sector) return false;
  if (f.industry && r.industry !== f.industry) return false;
  if (!inRange(r.health_score, f.healthScoreMin, f.healthScoreMax)) return false;
  if (!inRange(r.market_cap, f.marketCapMin, f.marketCapMax)) return false;
  if (!inRange(r.pe_ratio, f.peMin, f.peMax)) return false;
  if (!inRange(r.pb_ratio, f.pbMin, f.pbMax)) return false;
  if (!inRange(r.beta, f.betaMin, f.betaMax)) return false;
  if (!inRangeFractionAsPct(r.dividend_yield, f.divYieldMin, f.divYieldMax)) return false;
  if (!inRangeFractionAsPct(r.profit_margin, f.profitMarginMin, f.profitMarginMax)) return false;
  if (!inRange(r.revenue_growth_yoy, f.revenueGrowthMin, f.revenueGrowthMax)) return false;

  // 52-week range relative to 52w high (how far below high, as %)
  if ((f.week52ChangeMin != null || f.week52ChangeMax != null) && r.week52_high && r.week52_low) {
    const range52Pct = ((r.week52_high - r.week52_low) / r.week52_high) * 100;
    if (!inRange(range52Pct, f.week52ChangeMin, f.week52ChangeMax)) return false;
  }

  return true;
}
