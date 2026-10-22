/**
 * Data for the server-rendered stock subpages (/stock/[ticker]/dividends,
 * /congress-trades, /fund-holders): the attribute searches a beginner makes
 * ("AAPL dividends", "who in Congress owns NVDA") that rarely get an AI
 * answer in front of the results, so a page with the actual data still earns
 * the click. All of it is ours or cached: congress trades and 13F holdings
 * come from Supabase, dividends from the same cache entry the stock page's
 * Financials tab fills.
 */

import { createServerClient } from '@/lib/supabase/client';
import { getCached, setCached } from '@/lib/cache/market-data-cache';
import { getDividends, withRateLimitRetry, type DividendItem } from '@/lib/twelvedata/twelvedata-client';

export interface CongressTradeRow {
  politician: { slug: string; name: string; party: string | null; state: string | null; chamber: string | null };
  tradeType: string;
  amountRange: string | null;
  transactionDate: string | null;
  disclosureDate: string | null;
}

export async function getCongressTrades(symbol: string, limit = 200): Promise<CongressTradeRow[]> {
  const db = createServerClient();
  const { data, error } = await db
    .from('congress_trades')
    .select('trade_type, amount_range, transaction_date, disclosure_date, congress_politicians!inner(slug, display_name, party, state, chamber)')
    .eq('symbol', symbol.toUpperCase())
    .order('transaction_date', { ascending: false })
    .limit(limit);
  if (error) throw error;
  type Row = {
    trade_type: string; amount_range: string | null; transaction_date: string | null; disclosure_date: string | null;
    congress_politicians: { slug: string; display_name: string; party: string | null; state: string | null; chamber: string | null };
  };
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    politician: {
      slug: r.congress_politicians.slug,
      name: r.congress_politicians.display_name,
      party: r.congress_politicians.party,
      state: r.congress_politicians.state,
      chamber: r.congress_politicians.chamber,
    },
    tradeType: r.trade_type,
    amountRange: r.amount_range,
    transactionDate: r.transaction_date,
    disclosureDate: r.disclosure_date,
  }));
}

export interface FundHolderRow {
  fund: { slug: string; name: string; manager: string | null };
  periodOfReport: string;
  /** Pro detail: the caller decides whether to show these. */
  shares: number | null;
  valueUsd: number | null;
  portfolioPct: number | null;
}

/** The tracked funds whose latest 13F lists this ticker, biggest position first. */
export async function getFundHolders(symbol: string): Promise<FundHolderRow[]> {
  const db = createServerClient();
  // ~17 funds x 5 quarters: well under PostgREST's 1000-row cap.
  const { data: filings, error } = await db
    .from('institutional_filings')
    .select('id, investor_id, period_of_report, institutional_investors!inner(slug, display_name, manager_name, is_active)')
    .eq('parse_status', 'ok')
    .order('period_of_report', { ascending: false });
  if (error) throw error;
  type Filing = {
    id: string; investor_id: string; period_of_report: string;
    institutional_investors: { slug: string; display_name: string; manager_name: string | null; is_active: boolean };
  };
  const latest = new Map<string, Filing>();
  for (const f of (filings ?? []) as unknown as Filing[]) {
    if (f.institutional_investors.is_active && !latest.has(f.investor_id)) latest.set(f.investor_id, f);
  }
  if (latest.size === 0) return [];
  const byFiling = new Map([...latest.values()].map((f) => [f.id, f]));

  const { data: holdings, error: hErr } = await db
    .from('institutional_holdings')
    .select('filing_id, shares, value_usd, portfolio_pct, put_call')
    .eq('symbol', symbol.toUpperCase())
    .in('filing_id', [...byFiling.keys()]);
  if (hErr) throw hErr;

  // One row per fund: sum share-class/option lines, stock positions only.
  const perFund = new Map<string, FundHolderRow>();
  for (const h of (holdings ?? []) as Array<{ filing_id: string; shares: number | null; value_usd: number | null; portfolio_pct: number | null; put_call: string | null }>) {
    if (h.put_call) continue;
    const f = byFiling.get(h.filing_id);
    if (!f) continue;
    const prev = perFund.get(f.investor_id);
    perFund.set(f.investor_id, {
      fund: { slug: f.institutional_investors.slug, name: f.institutional_investors.display_name, manager: f.institutional_investors.manager_name },
      periodOfReport: f.period_of_report,
      shares: (prev?.shares ?? 0) + Number(h.shares ?? 0),
      valueUsd: (prev?.valueUsd ?? 0) + Number(h.value_usd ?? 0),
      portfolioPct: (prev?.portfolioPct ?? 0) + Number(h.portfolio_pct ?? 0),
    });
  }
  return [...perFund.values()].sort((a, b) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0));
}

/**
 * Dividend history. Non-payers (no yield in screener_stats) skip the API
 * call entirely, so a crawler walking the pages can't spend credits on
 * companies that have nothing to show. Same cache key and TTL the stock
 * page's Financials tab uses, so the two never fetch twice.
 */
export async function getDividendHistory(symbol: string): Promise<{ items: DividendItem[]; yieldPct: number | null }> {
  const sym = symbol.toUpperCase();
  const db = createServerClient();
  // Errors throw, here and below: the page tells "couldn't load" apart from
  // "pays none", which says a false thing and noindexes the page.
  const { data: stats, error } = await db.from('screener_stats').select('dividend_yield').eq('ticker', sym).maybeSingle();
  if (error) throw error;
  const raw = (stats as { dividend_yield: number | null } | null)?.dividend_yield ?? null;
  const yieldPct = raw != null && Number.isFinite(Number(raw)) ? Number(raw) : null;
  // No yield on record (null or 0) means no fetch: an empty answer isn't
  // cached, so a crawler would otherwise pay for TSLA's nothing every visit.
  if (!yieldPct) return { items: [], yieldPct };

  const cacheKey = `financials:${sym}:dividends:quarterly`;
  const cached = await getCached<DividendItem[]>(cacheKey);
  if (cached) return { items: cached, yieldPct };
  const items = await withRateLimitRetry(() => getDividends(sym));
  // Only non-empty results are cached, as in the financials route: an empty
  // array can be a transient partial response.
  if (items.length > 0) void setCached(cacheKey, sym, 'financials', items, 24 * 60 * 60);
  return { items, yieldPct };
}

/** Which subpages have anything on them for this ticker, for the subpage tabs; null when unknown. */
export async function getAvailableSubpages(ticker: string): Promise<Array<'dividends' | 'congress' | 'funds'> | null> {
  const c = await getSubpageCoverage([ticker]).catch(() => null);
  if (!c) return null;
  return [
    ...(c.dividends.has(ticker) ? ['dividends' as const] : []),
    ...(c.congress.has(ticker) ? ['congress' as const] : []),
    ...(c.funds.has(ticker) ? ['funds' as const] : []),
  ];
}

/**
 * Below these, a congress-trades / fund-holders subpage is a sentence and a
 * couple of rows. Such a page stays linked for readers but is left out of the
 * sitemap and marked noindex, both measured with getSubpageCoverage's counts
 * so the two can't disagree. 2026-10-22 Search Console: ~468 of these pages,
 * found through the stock page's links, sat in "Discovered, not indexed".
 */
export const MIN_CONGRESS_TRADES = 5;
export const MIN_FUND_HOLDERS = 3;

/**
 * Of the given tickers, how many congress trades / tracked funds (latest
 * filing) each has, and which pay a dividend, for the sitemap and the stock
 * page's subpage links. A ticker with none is absent, so `.has()` means "has
 * a page". Every query is bounded by the list (~520), under PostgREST's
 * 1000-row cap; see migrations 163 and 171 for why the first two are functions.
 */
export async function getSubpageCoverage(tickers: string[]): Promise<{ congress: Map<string, number>; funds: Map<string, number>; dividends: Set<string> }> {
  const db = createServerClient();
  const [congress, funds, divs] = await Promise.all([
    db.rpc('congress_trade_counts_among' as never, { p_symbols: tickers } as never),
    db.rpc('fund_holder_counts_among' as never, { p_symbols: tickers } as never),
    db.from('screener_stats').select('ticker').in('ticker', tickers).gt('dividend_yield', 0),
  ]);
  const toMap = (rows: unknown, key: string) =>
    new Map(((rows ?? []) as Array<{ symbol: string } & Record<string, number>>).map((r) => [r.symbol.toUpperCase(), Number(r[key])]));
  return {
    congress: toMap(congress.data, 'trades'),
    funds: toMap(funds.data, 'funds'),
    dividends: new Set(((divs.data ?? []) as Array<{ ticker: string }>).map((r) => r.ticker.toUpperCase())),
  };
}
