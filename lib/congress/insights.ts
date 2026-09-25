/**
 * Read-side insight over stored congressional disclosures.
 *
 * Nothing here calls Disclosed Capitol: every vendor credit is real money, so
 * insight is computed from rows the weekly refresh already paid for. The only
 * external calls are TwelveData quotes/candles for the scorecard, which is a
 * flat-rate plan, admission-controlled and cached.
 *
 * The disclosures themselves stay free (5 U.S.C. 13107, see migration 149);
 * what Pro buys is the cross-referencing and analysis built on them.
 */

import { createServerClient } from '@/lib/supabase/client';
import { getCached, setCached } from '@/lib/cache/market-data-cache';
import { getStockCandles, getStockQuotes } from '@/lib/twelvedata/twelvedata-client';
import { tryReserveOrganicCredits } from '@/lib/twelvedata/credit-budget';
import { tradeDirection } from './types';

export interface ActivityTrade {
  slug: string;
  displayName: string;
  party: string | null;
  chamber: string | null;
  symbol: string;
  tradeType: string;
  amountRange: string;
  amountLow: number | null;
  amountHigh: number | null;
  transactionDate: string;
  disclosureDate: string | null;
  priceAtTrade: number | null;
  priceAtDisclosure: number | null;
}

interface TradeJoinRow {
  symbol: string;
  trade_type: string;
  amount_range: string;
  amount_low: number | null;
  amount_high: number | null;
  transaction_date: string;
  disclosure_date: string | null;
  price_at_trade: number | null;
  price_at_disclosure: number | null;
  congress_politicians: { slug: string; display_name: string; party: string | null; chamber: string | null; is_active: boolean } | null;
}

const TRADE_SELECT =
  'symbol, trade_type, amount_range, amount_low, amount_high, transaction_date, disclosure_date, price_at_trade, price_at_disclosure, congress_politicians!inner(slug, display_name, party, chamber, is_active)';

function toActivity(r: TradeJoinRow): ActivityTrade {
  const p = r.congress_politicians!;
  return {
    slug: p.slug,
    displayName: p.display_name,
    party: p.party,
    chamber: p.chamber,
    symbol: r.symbol,
    tradeType: r.trade_type,
    amountRange: r.amount_range,
    amountLow: r.amount_low == null ? null : Number(r.amount_low),
    amountHigh: r.amount_high == null ? null : Number(r.amount_high),
    transactionDate: r.transaction_date,
    disclosureDate: r.disclosure_date,
    priceAtTrade: r.price_at_trade == null ? null : Number(r.price_at_trade),
    priceAtDisclosure: r.price_at_disclosure == null ? null : Number(r.price_at_disclosure),
  };
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

/** Tracked members' trades in given symbols since `sinceDays` ago, newest first. */
export async function getTradesForSymbols(symbols: string[], sinceDays: number, limit = 200): Promise<ActivityTrade[]> {
  const upper = [...new Set(symbols.map((s) => s.toUpperCase()))];
  if (upper.length === 0) return [];
  const { data, error } = await createServerClient()
    .from('congress_trades')
    .select(TRADE_SELECT)
    .in('symbol', upper)
    .eq('congress_politicians.is_active', true)
    .gte('transaction_date', isoDaysAgo(sinceDays))
    .order('transaction_date', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as TradeJoinRow[]).map(toActivity);
}

// ─── Scorecard ──────────────────────────────────────────────────────────────

export interface ScorecardTrade {
  symbol: string;
  disclosureDate: string;
  /** Held from the close on the disclosure date until the latest price. */
  returnPct: number;
  spyReturnPct: number;
}

export interface Scorecard {
  /** Buys with a real disclosure-date close and a current price. */
  count: number;
  medianReturnPct: number;
  medianExcessPct: number;
  /** Share of those buys that beat SPY over their own holding window. */
  beatSpyPct: number;
  medianDaysHeld: number;
  trades: ScorecardTrade[];
  asOf: string;
}

const SCORECARD_TTL = 12 * 60 * 60;
const MIN_TRADES = 5;

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** SPY daily closes keyed by ISO date, shared by every scorecard (1 credit a day). */
async function spyCloses(fromDate: string): Promise<Map<string, number> | null> {
  const key = `congress:spy-daily:${fromDate.slice(0, 7)}`;
  const cached = await getCached<[string, number][]>(key);
  if (cached) return new Map(cached);
  if (!(await tryReserveOrganicCredits(1))) return null;
  const now = Math.floor(Date.now() / 1000);
  const candles = await getStockCandles('SPY', Math.floor(Date.parse(fromDate) / 1000) - 10 * 86400, now, 'D');
  const pairs: [string, number][] = candles.t.map((t, i) => [new Date(t * 1000).toISOString().slice(0, 10), candles.c[i]]);
  void setCached(key, 'congress', 'congress_spy_daily', pairs, SCORECARD_TTL);
  return new Map(pairs);
}

/** Latest SPY close on or before `date` (a disclosure can land on a weekend). */
function closeOnOrBefore(closes: Map<string, number>, sortedDates: string[], date: string): number | null {
  let lo = 0, hi = sortedDates.length - 1, found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (sortedDates[mid] <= date) { found = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return found >= 0 ? closes.get(sortedDates[found]) ?? null : null;
}

/**
 * What copying a member's buys would really have returned: bought at the
 * close on the day each trade became public (the earliest anyone else could
 * act), held until today, against SPY over the exact same window. Every buy
 * counts equally, because filings only give an amount bracket and weighting
 * by a bracket midpoint would be a number nobody filed.
 *
 * Returns null under MIN_TRADES buys, or when prices are unavailable right
 * now; the caller shows "not enough data", never a partial figure.
 */
export async function getScorecard(slug: string): Promise<Scorecard | null> {
  const cacheKey = `congress:scorecard:${slug}`;
  const cached = await getCached<Scorecard | { empty: true }>(cacheKey);
  if (cached) return 'empty' in cached ? null : cached;

  const { data } = await createServerClient()
    .from('congress_trades')
    .select('symbol, trade_type, disclosure_date, price_at_disclosure, congress_politicians!inner(slug)')
    .eq('congress_politicians.slug', slug)
    .not('symbol', 'is', null)
    .not('price_at_disclosure', 'is', null)
    .not('disclosure_date', 'is', null);

  const buys = ((data ?? []) as unknown as { symbol: string; trade_type: string; disclosure_date: string; price_at_disclosure: number }[])
    .filter((r) => tradeDirection(r.trade_type) === 'buy' && Number(r.price_at_disclosure) > 0);

  if (buys.length < MIN_TRADES) {
    void setCached(cacheKey, 'congress', 'congress_scorecard', { empty: true }, SCORECARD_TTL);
    return null;
  }

  const symbols = [...new Set(buys.map((b) => b.symbol))];
  // One credit per symbol. Under load, show nothing rather than breach the
  // account-wide per-minute cap; the next visitor retries.
  if (!(await tryReserveOrganicCredits(symbols.length))) return null;
  const [quotes, spy] = await Promise.all([
    getStockQuotes(symbols),
    spyCloses(buys.reduce((min, b) => (b.disclosure_date < min ? b.disclosure_date : min), buys[0].disclosure_date)),
  ]);
  if (!spy || spy.size === 0) return null;
  const spyDates = [...spy.keys()].sort();
  const spyNow = spy.get(spyDates[spyDates.length - 1])!;

  const today = Date.now();
  const trades: ScorecardTrade[] = [];
  const days: number[] = [];
  for (const b of buys) {
    const now = quotes.get(b.symbol)?.c;
    const spyThen = closeOnOrBefore(spy, spyDates, b.disclosure_date);
    if (!now || !spyThen) continue;
    trades.push({
      symbol: b.symbol,
      disclosureDate: b.disclosure_date,
      returnPct: (now / Number(b.price_at_disclosure) - 1) * 100,
      spyReturnPct: (spyNow / spyThen - 1) * 100,
    });
    days.push((today - Date.parse(b.disclosure_date)) / 86_400_000);
  }
  if (trades.length < MIN_TRADES) return null;

  const scorecard: Scorecard = {
    count: trades.length,
    medianReturnPct: median(trades.map((t) => t.returnPct)),
    medianExcessPct: median(trades.map((t) => t.returnPct - t.spyReturnPct)),
    beatSpyPct: (trades.filter((t) => t.returnPct > t.spyReturnPct).length / trades.length) * 100,
    medianDaysHeld: Math.round(median(days)),
    trades: trades.sort((a, b) => b.disclosureDate.localeCompare(a.disclosureDate)),
    asOf: new Date().toISOString(),
  };
  void setCached(cacheKey, 'congress', 'congress_scorecard', scorecard, SCORECARD_TTL);
  return scorecard;
}
