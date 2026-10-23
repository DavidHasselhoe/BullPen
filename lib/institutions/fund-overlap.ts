/**
 * Which tracked funds changed a position, last quarter on the one before, in
 * the stocks a user owns or watches. The 13F counterpart of the Washington
 * Trading overlap (app/api/congress/overlap): same idea, but 13Fs arrive once a
 * quarter, so it reads "what each fund did in its latest filing", not a window
 * of days.
 *
 * Classified on share count with the fund page's 1% noise band
 * (compute-diff.ts), so a fund that did not trade does not read "added" in a
 * quarter the stock rallied.
 */

import { createServerClient } from '@/lib/supabase/client';
import { UNCHANGED_BAND_PCT } from './compute-diff';

export type FundMoveStatus = 'new' | 'increased' | 'reduced' | 'sold_out';

export interface FundMove {
  symbol: string;
  fund: { slug: string; name: string; manager: string | null; logoUrl: string | null };
  /** Quarter-end of the fund's latest filing (YYYY-MM-DD). */
  period: string;
  status: FundMoveStatus;
  /** Signed share-count change; null for new and sold-out positions. */
  sharesChangePct: number | null;
  /** Position after the move (0 when sold out). */
  valueUsd: number;
  portfolioPct: number | null;
}

/** Pure: a position's share count in the fund's previous and latest filing, to a move or null (no real change). */
export function classifyMove(prevShares: number, curShares: number): { status: FundMoveStatus; pct: number | null } | null {
  if (prevShares <= 0 && curShares <= 0) return null;
  if (prevShares <= 0) return { status: 'new', pct: null };
  if (curShares <= 0) return { status: 'sold_out', pct: null };
  const pct = ((curShares - prevShares) / prevShares) * 100;
  if (Math.abs(pct) < UNCHANGED_BAND_PCT) return null;
  return { status: pct > 0 ? 'increased' : 'reduced', pct };
}

type Filing = {
  id: string;
  investor_id: string;
  period_of_report: string;
  institutional_investors: { slug: string; display_name: string; manager_name: string | null; logo_url: string | null; is_active: boolean };
};
type HoldingRow = { filing_id: string; cusip: string; symbol: string | null; shares: number | null; value_usd: number | null; portfolio_pct: number | null; share_type: string | null };

/** All rows matching `filter`, paged: PostgREST silently caps a select at 1000. */
async function pagedHoldings(filingIds: string[], column: 'symbol' | 'cusip', values: string[]): Promise<HoldingRow[]> {
  const db = createServerClient();
  const rows: HoldingRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from('institutional_holdings')
      .select('filing_id, cusip, symbol, shares, value_usd, portfolio_pct, share_type')
      .in('filing_id', filingIds)
      .in(column, values)
      .is('put_call', null)
      .order('filing_id')
      .order('cusip')
      .range(from, from + 999);
    if (error) throw error;
    rows.push(...((data ?? []) as HoldingRow[]));
    if (!data || data.length < 1000) return rows;
  }
}

export async function getFundMovesForSymbols(symbols: string[]): Promise<FundMove[]> {
  const wanted = [...new Set(symbols.map((s) => s.toUpperCase()))];
  if (wanted.length === 0) return [];
  const db = createServerClient();

  // ~18 funds x 5 quarters: well under the 1000-row cap.
  const { data: filings, error } = await db
    .from('institutional_filings')
    .select('id, investor_id, period_of_report, institutional_investors!inner(slug, display_name, manager_name, logo_url, is_active)')
    .eq('parse_status', 'ok')
    .order('period_of_report', { ascending: false });
  if (error) throw error;

  // Each active fund's latest filing and the one for the quarter before it.
  // An amendment shares its quarter, so "before" means an earlier period.
  const pairs = new Map<string, { latest: Filing; prev: Filing }>();
  const latestOf = new Map<string, Filing>();
  for (const f of (filings ?? []) as unknown as Filing[]) {
    if (!f.institutional_investors.is_active || pairs.has(f.investor_id)) continue;
    const latest = latestOf.get(f.investor_id);
    if (!latest) latestOf.set(f.investor_id, f);
    else if (f.period_of_report < latest.period_of_report) pairs.set(f.investor_id, { latest, prev: f });
  }
  if (pairs.size === 0) return [];
  const filingIds = [...pairs.values()].flatMap((p) => [p.latest.id, p.prev.id]);

  // Two passes, keyed on CUSIP: a quarter whose ticker never resolved
  // (symbol NULL) must not turn a held position into "new" or "sold out".
  const bySymbol = await pagedHoldings(filingIds, 'symbol', wanted);
  const symbolOf = new Map<string, string>();
  for (const r of bySymbol) if (r.symbol) symbolOf.set(r.cusip, r.symbol.toUpperCase());
  if (symbolOf.size === 0) return [];
  const rows = await pagedHoldings(filingIds, 'cusip', [...symbolOf.keys()]);

  // Shares, value and weight per filing and stock, summed across share-class lines. Bonds (PRN) are not shares.
  const totals = new Map<string, { shares: number; value: number; pct: number }>();
  for (const r of rows) {
    if (r.share_type === 'PRN') continue;
    const symbol = symbolOf.get(r.cusip)!;
    const key = `${r.filing_id}|${symbol}`;
    const t = totals.get(key) ?? { shares: 0, value: 0, pct: 0 };
    t.shares += Number(r.shares ?? 0);
    t.value += Number(r.value_usd ?? 0);
    t.pct += Number(r.portfolio_pct ?? 0);
    totals.set(key, t);
  }

  const moves: FundMove[] = [];
  const stocks = [...new Set(symbolOf.values())];
  for (const { latest, prev } of pairs.values()) {
    for (const symbol of stocks) {
      const cur = totals.get(`${latest.id}|${symbol}`);
      const old = totals.get(`${prev.id}|${symbol}`);
      const move = classifyMove(old?.shares ?? 0, cur?.shares ?? 0);
      if (!move) continue;
      const inv = latest.institutional_investors;
      moves.push({
        symbol,
        fund: { slug: inv.slug, name: inv.display_name, manager: inv.manager_name, logoUrl: inv.logo_url },
        period: latest.period_of_report,
        status: move.status,
        sharesChangePct: move.pct,
        valueUsd: cur?.value ?? 0,
        portfolioPct: cur ? cur.pct : null,
      });
    }
  }
  return moves;
}
