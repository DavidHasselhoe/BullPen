/**
 * Rebuilds `search_index`, the symbol catalogue the browser downloads once and
 * then searches locally on every keystroke (see /api/search/index).
 *
 * Lives here rather than inside the route handler so it can be run directly
 * with `npm run refresh-search-index`. Driving it over HTTP against a dev
 * server is unreliable: Next serves a stale compiled copy of a route often
 * enough that a run can silently execute pre-edit code.
 */

import { createServerClient } from '@/lib/supabase/client';
import { getUsStocksList, getUsEtfList, getUsFundsList, type StockReference } from '@/lib/twelvedata/twelvedata-client';
import { rankFromMarketCap, rankFromEtfName, INDEX_MEMBER_RANK, INDEX_FUND_RANK } from '@/lib/search/index-rank';
import { SP500_TICKERS } from '@/lib/market-data/sp500';
import { NASDAQ100_TICKERS } from '@/lib/market-data/nasdaq100';

/** Exchanges a retail user can actually trade on. OTC is deliberately excluded:
 *  it is 12k+ shells and delisted tickers, two-thirds of the /stocks feed, and
 *  including it makes the payload bigger and every search result worse. */
const MAIN_EXCHANGES = new Set(['NYSE', 'NASDAQ', 'CBOE', 'AMEX', 'NYSE American']);

/** Instrument types worth searching. Warrants, preferred shares and depositary
 *  units are tradeable but are never what someone typing "apple" wants. */
const STOCK_TYPES = new Set([
  'Common Stock',
  'American Depositary Receipt',
  'REIT',
  'Real Estate Investment Trust (REIT)',
]);

/** Real tradeable symbols. TwelveData's feed carries a few internal rows like
 *  "!OTC/FLZH" that are not symbols anyone can type or trade. */
const VALID_TICKER = /^[A-Z0-9][A-Z0-9.-]*$/;

const UPSERT_CHUNK = 500;

/** A US open-end fund ticker: exactly five letters ending in X (VFIAX, FXAIX).
 *  The /funds feed files structured notes and bank CDs under "Mutual Fund" too,
 *  and those are seven characters ending in XX, so shape is the filter that
 *  works where the type field does not. */
const FUND_TICKER = /^[A-Z]{4}X$/;

/** An exchange-traded ticker: one to five letters, nothing else. TwelveData's
 *  /etf feed is badly contaminated — of 11,048 US rows, 2,280 have tickers
 *  longer than five characters and another 2,957 are five ending in X, and
 *  sampling those returns things like "PIMCO RealPath Blend 2040 Fund Class A"
 *  and "Putnam Retirement Advantage 2065 Fund Class R3". They are mutual fund
 *  share classes, and listing them as ETFs is both noise in the results and a
 *  wrong label on the page. Only 10 of those ~3k rows even say "ETF" in their
 *  own name. The ones that are index funds come back through the funds pass
 *  below, correctly labelled. */
const ETF_TICKER = /^[A-Z]{1,5}$/;

/** Only funds that say what they are. The catalogue holds 122k mutual funds and
 *  856 of them are index funds; the rest are active products with a sales load
 *  that nobody searches for by name. A substring test is deliberate — it also
 *  catches "Indexed" and "IndexIQ", which are the same kind of product. */
const isIndexFundName = (name: string) => name.toLowerCase().includes('index');

interface IndexRow {
  ticker: string;
  name: string;
  kind: 's' | 'e' | 'f';
  exchange: string | null;
  rank: number;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Market caps for every ticker we hold stats on, paged past PostgREST's 1000-row cap. */
async function marketCaps(): Promise<Map<string, number>> {
  const supabase = createServerClient();
  const caps = new Map<string, number>();
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('screener_stats')
      .select('ticker, market_cap')
      .not('market_cap', 'is', null)
      .order('ticker', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`market caps: ${error.message}`);
    const rows = (data ?? []) as Array<{ ticker: string; market_cap: number | null }>;
    for (const r of rows) caps.set(r.ticker.toUpperCase(), Number(r.market_cap) || 0);
    if (rows.length < PAGE) break;
  }
  return caps;
}

export interface RefreshResult {
  feedRows: { stocks: number; etfs: number; funds: number };
  /** False when the funds feed failed, was skipped, or is only part-walked. */
  fundsRefreshed: boolean;
  /** Next funds page to resume from, or null when the catalogue is exhausted. */
  nextFundPage: number | null;
  stocks: number;
  etfs: number;
  indexFunds: number;
  total: number;
  ranked: number;
}

/** Thrown internally to skip the funds pass; never escapes this module. */
class SkipPart extends Error {}

export class FeedTooSmallError extends Error {
  constructor(public readonly rows: number) {
    super(`search index feed returned only ${rows} rows`);
  }
}

/** Which catalogue to rebuild. Each source is a separate multi-megabyte fetch
 *  from an upstream that has been measured anywhere between 6s and 153s for the
 *  same call, so they are refreshable one at a time: a serverless invocation can
 *  hold one of these comfortably and all three only on a good day. */
export type RefreshPart = 'stocks' | 'etfs' | 'funds';
export const ALL_PARTS: RefreshPart[] = ['stocks', 'etfs', 'funds'];

export async function refreshSearchIndex(
  parts: RefreshPart[] = ALL_PARTS,
  /** Where to resume the funds catalogue, and how much of it to walk in this
   *  run. A serverless invocation passes a small window and repeats; a script on
   *  a runner walks the whole thing in one go. */
  fundWindow: { startPage?: number; maxPages?: number } = {}
): Promise<RefreshResult> {

    // Sequential on purpose: these are a ~5.6MB and a ~3MB body. Fetched in
    // parallel they share the same connection budget and both run slower, which
    // pushed the pair past its timeout. The market-cap query is a different
    // resource, so that one does overlap.
    const capsPromise = marketCaps();
    const stocks = parts.includes('stocks') ? await getUsStocksList({ country: 'United States' }) : [];
    const etfs = parts.includes('etfs') ? await getUsEtfList({ country: 'United States' }) : [];
    // The funds catalogue is ~270 paged requests and takes about ten minutes.
    // It is also the least reliable of the three, so a failure here never fails
    // the refresh: existing fund rows are kept and left out of the prune below.
    // A week-old index-fund name is worth incomparably more than no funds.
    let funds: StockReference[] = [];
    let nextFundPage: number | null = null;
    let fundsRefreshed = parts.includes('funds');
    try {
      if (!parts.includes('funds')) throw new SkipPart();
      const fundResult = await getUsFundsList({
        country: 'United States',
        startPage: fundWindow.startPage,
        maxPages: fundWindow.maxPages,
        onProgress: (scanned, kept) => {
          if (scanned % 20000 === 0) console.log(`  …scanned ${scanned} funds, kept ${kept}`);
        },
        filter: (r) =>
          r.type === 'Mutual Fund' &&
          r.currency === 'USD' &&
          FUND_TICKER.test(r.symbol.toUpperCase()) &&
          isIndexFundName(r.name),
      });
      funds = fundResult.rows;
      nextFundPage = fundResult.nextPage;
    } catch (err) {
      fundsRefreshed = false;
      if (!(err instanceof SkipPart)) {
        console.warn('[refresh-search-index] funds feed failed, keeping existing fund rows:', err);
      }
    }
    if (fundsRefreshed && nextFundPage !== null) {
      // Mid-walk: rows from this window are written, but the catalogue has not
      // been seen in full, so nothing may be pruned yet.
      fundsRefreshed = false;
    }
    if (fundsRefreshed && funds.length === 0) {
      // An empty feed that did not throw is still a broken feed, and treating it
      // as a successful refresh would prune every index fund out of the index.
      fundsRefreshed = false;
      console.warn('[refresh-search-index] funds feed returned nothing, keeping existing fund rows');
    }
    const caps = await capsPromise;

    const indexMembers = new Set(
      [...SP500_TICKERS, ...NASDAQ100_TICKERS].map((t) => t.toUpperCase())
    );

    const seen = new Set<string>();
    const rows: IndexRow[] = [];

    // Stocks first so a symbol listed as both keeps its equity identity.
    for (const s of stocks) {
      if (!MAIN_EXCHANGES.has(s.exchange) || !STOCK_TYPES.has(s.type)) continue;
      const ticker = s.symbol.toUpperCase();
      if (seen.has(ticker) || !VALID_TICKER.test(ticker)) continue;
      seen.add(ticker);
      rows.push({
        ticker,
        name: s.name || ticker,
        kind: 's',
        exchange: s.exchange || null,
        rank:
          rankFromMarketCap(caps.get(ticker)) ||
          (indexMembers.has(ticker) ? INDEX_MEMBER_RANK : 0),
      });
    }

    for (const e of etfs) {
      if (!MAIN_EXCHANGES.has(e.exchange)) continue;
      const ticker = e.symbol.toUpperCase();
      if (seen.has(ticker)) continue;
      if (!ETF_TICKER.test(ticker) || FUND_TICKER.test(ticker)) continue;
      seen.add(ticker);
      const name = e.name || ticker;
      rows.push({
        ticker,
        name,
        kind: 'e',
        exchange: e.exchange || null,
        rank: rankFromEtfName(ticker, name),
      });
    }

    for (const f of funds) {
      const ticker = f.symbol.toUpperCase();
      if (seen.has(ticker)) continue;
      seen.add(ticker);
      rows.push({ ticker, name: f.name, kind: 'f', exchange: f.exchange || null, rank: INDEX_FUND_RANK });
    }

    // Only meaningful when the stock catalogue was part of this run; a funds-only
    // refresh legitimately produces under a thousand rows.
    if (parts.includes('stocks') && rows.length < 1000) {
      // A short feed means TwelveData returned something unexpected. Refuse
      // rather than replacing a working index with a broken one.
      throw new FeedTooSmallError(rows.length);
    }

    const supabase = createServerClient();
    const now = new Date().toISOString();
    for (const group of chunk(rows, UPSERT_CHUNK)) {
      const { error } = await supabase
        .from('search_index')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .upsert(group.map((r) => ({ ...r, updated_at: now })) as any, { onConflict: 'ticker' });
      if (error) throw new Error(`upsert: ${error.message}`);
    }

    // Anything not in this run's feed has been delisted or renamed away. Only
    // the kinds this run actually refreshed are eligible, so a failed funds
    // fetch cannot wipe every index fund out of the catalogue.
    const liveKinds = [
      ...(parts.includes('stocks') ? ['s'] : []),
      ...(parts.includes('etfs') ? ['e'] : []),
    ];
    if (liveKinds.length > 0) {
      const { error } = await supabase
        .from('search_index')
        .delete()
        .lt('updated_at', now)
        .in('kind', liveKinds);
      if (error) throw new Error(`prune: ${error.message}`);
    }
    if (fundsRefreshed) {
      // Funds can be walked across several invocations, each with its own `now`.
      // Pruning at `now` would delete the rows earlier windows just wrote, so
      // the cutoff is old enough to cover a whole sweep and short enough that a
      // delisted fund disappears on the next run.
      const sweepCutoff = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
      const { error } = await supabase
        .from('search_index')
        .delete()
        .lt('updated_at', sweepCutoff)
        .eq('kind', 'f');
      if (error) throw new Error(`prune funds: ${error.message}`);
    }

    return {
      feedRows: { stocks: stocks.length, etfs: etfs.length, funds: funds.length },
      fundsRefreshed,
      nextFundPage,
      stocks: rows.filter((r) => r.kind === 's').length,
      etfs: rows.filter((r) => r.kind === 'e').length,
      indexFunds: rows.filter((r) => r.kind === 'f').length,
      total: rows.length,
      ranked: rows.filter((r) => r.rank > 0).length,
    };

}

/**
 * What the catalogue says a symbol is, or null if it isn't in there.
 *
 * TwelveData's /quote omits `type` for funds (confirmed for VFIAX), so this is
 * how the app knows an index fund from an ETF when it has nothing else to go on.
 * A primary-key lookup against a table we already maintain.
 */
export async function getIndexedKind(ticker: string): Promise<'s' | 'e' | 'f' | null> {
  try {
    const supabase = createServerClient();
    const { data } = await supabase
      .from('search_index')
      .select('kind')
      .eq('ticker', ticker.toUpperCase())
      .maybeSingle();
    const kind = (data as { kind?: string } | null)?.kind;
    return kind === 's' || kind === 'e' || kind === 'f' ? kind : null;
  } catch {
    return null;
  }
}

/** The TwelveData instrument_type string for a catalogue kind. */
export function instrumentTypeForKind(kind: 's' | 'e' | 'f' | null): string | null {
  if (kind === 's') return 'Common Stock';
  if (kind === 'e') return 'ETF';
  if (kind === 'f') return 'Mutual Fund';
  return null;
}
