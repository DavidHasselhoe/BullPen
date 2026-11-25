/**
 * The screener's universe loading and filter predicate, shared by the
 * /api/screener route and Bull's screenStocks tool so the two can never
 * disagree about what "health score 70+" or "S&P 500" matches.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ScreenerRow } from '@/app/api/screener/route';
import { SP500_TICKERS } from '@/lib/market-data/sp500';
import { NASDAQ100_TICKERS } from '@/lib/market-data/nasdaq100';
import { DOW30_TICKERS } from '@/lib/market-data/dow30';
import type { IndexId } from '@/lib/market-data/index-membership';
import { isDuplicateShareClass } from '@/lib/market-data/dual-class-shares';
import { fetchAllPages } from '@/lib/supabase/paging';

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

const INDEX_TICKERS: Record<IndexId, string[]> = {
  sp500: SP500_TICKERS,
  nasdaq100: NASDAQ100_TICKERS,
  dow30: DOW30_TICKERS,
};

export type ScreenerScope = IndexId | 'all' | 'active';

export function isIndexScope(scope: string | null | undefined): scope is IndexId {
  return scope != null && Object.hasOwn(INDEX_TICKERS, scope);
}

/**
 * The "all" and default views hide rows older than this. The tier-0 long tail
 * is only refreshed by the rotating discovery sweep, and before it was sped up
 * small caps sat in "View all" with P/E and yield up to 5 months old and no
 * date. The sweep laps the tail in ~16 days (cron-refresh-screener-discovery.yml).
 * Tier 1 is refreshed nightly, so an old active row is a stock TwelveData
 * stopped answering for (usually acquired), not one waiting its turn.
 */
const STALE_ROW_MAX_AGE_DAYS = 30;

export function screenerStaleCutoffIso(now = Date.now()): string {
  return new Date(now - STALE_ROW_MAX_AGE_DAYS * 86_400_000).toISOString();
}

/**
 * Base rows for one screener view, ordered by market cap:
 *  - symbols: just those tickers (holdings / watchlist / custom views). Exempt
 *    from dual-class dedup, since a user may hold the non-canonical class.
 *  - 'sp500' / 'nasdaq100' / 'dow30': the real index constituents, whatever
 *    their tier, so a member outside the actively-tracked universe still shows.
 *    Same 30-day cutoff (CTRA, an override that is never refetched, sat in
 *    the S&P 500 view on July numbers).
 *  - 'all': every row in screener_stats refreshed in the last 30 days.
 *  - 'active': the tier-1 actively-tracked universe via screener_active_rows(),
 *    so the on-demand/discovery long tail never bloats the default screen.
 *    Same 30-day cutoff.
 */
export async function loadScreenerUniverse(
  supabase: SupabaseClient,
  opts: { symbols?: string[]; scope: ScreenerScope },
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
  const cutoff = screenerStaleCutoffIso();
  if (isIndexScope(opts.scope)) {
    const { data, error } = await supabase
      .from('screener_stats')
      .select('*')
      .in('ticker', INDEX_TICKERS[opts.scope])
      .gte('updated_at', cutoff)
      .order('market_cap', { ascending: false, nullsFirst: false });
    result = { rows: (data ?? []) as ScreenerRow[], error: error?.message ?? null };
  } else if (opts.scope === 'all') {
    result = await fetchAllPages<ScreenerRow>(() =>
      supabase
        .from('screener_stats')
        .select('*')
        .gte('updated_at', cutoff)
        .order('market_cap', { ascending: false, nullsFirst: false })
        .order('ticker', { ascending: true })
    );
  } else {
    result = await fetchAllPages<ScreenerRow>(() =>
      supabase
        .rpc('screener_active_rows')
        .gte('updated_at', cutoff)
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
  // A P/E or P/B at or below zero is a loss-maker or negative equity, shown as
  // "—" in the table. Treat it as missing, or "P/E under 15" keeps 500+ of them.
  if (!inRange(r.pe_ratio != null && r.pe_ratio > 0 ? r.pe_ratio : null, f.peMin, f.peMax)) return false;
  if (!inRange(r.pb_ratio != null && r.pb_ratio > 0 ? r.pb_ratio : null, f.pbMin, f.pbMax)) return false;
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

/** One entry per sidebar control, turned off together. Sector takes its industry with it. */
const RELAX_GROUPS: (keyof ScreenerFilterParams)[][] = [
  ['sector', 'industry'], ['industry'],
  ['healthScoreMin', 'healthScoreMax'], ['marketCapMin', 'marketCapMax'],
  ['peMin', 'peMax'], ['pbMin', 'pbMax'], ['betaMin', 'betaMax'],
  ['divYieldMin', 'divYieldMax'], ['profitMarginMin', 'profitMarginMax'],
  ['revenueGrowthMin', 'revenueGrowthMax'], ['week52ChangeMin', 'week52ChangeMax'],
];

export interface RelaxOption { keys: (keyof ScreenerFilterParams)[]; count: number }

/**
 * For a screen with no matches: how many stocks dropping each single filter
 * would bring back, most first. Powers "Remove Dividend 4%+ to see 12 stocks"
 * instead of a dead end.
 */
export function relaxScreenerFilters(rows: ScreenerRow[], f: ScreenerFilterParams, limit = 2): RelaxOption[] {
  const on = (keys: (keyof ScreenerFilterParams)[]) =>
    keys[0] === 'sector' ? f.sector != null : keys.some((k) => f[k] != null);
  return RELAX_GROUPS.filter(on)
    .map((keys) => {
      const loosened = { ...f };
      for (const k of keys) delete loosened[k];
      return { keys, count: rows.filter((r) => matchesScreenerFilters(r, loosened)).length };
    })
    .filter((o) => o.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}
