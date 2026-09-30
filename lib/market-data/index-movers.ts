/**
 * BullPen's one definition of "market movers": the S&P 500 and Nasdaq-100
 * names with the largest % change on the most recent trading session, ranked
 * from TwelveData quotes. Used by Discover and the Daily Brief.
 *
 * Why not TwelveData's /market_movers/stocks: it ranks the whole US market by
 * % change, so it is dominated by small caps and penny stocks with extreme
 * moves (a $300M company up 80% on a press release). For a beginner audience
 * a Nasdaq-100 name down 8% is the news; the endpoint has no market-cap or
 * index filter, and filtering its 50 rows down to index members leaves almost
 * nothing. Same reasoning as the Instagram movers posts, which use this
 * universe too.
 *
 * The definition, precisely:
 *  - Universe: S&P 500 + Nasdaq-100, one share class per company (GOOGL, not
 *    also GOOG).
 *  - Change: last regular-session price vs the previous regular close. Never
 *    extended hours: pre-market and after-hours prints are thin and noisy,
 *    so outside the regular session the list shows the last completed
 *    session, labelled as such.
 *  - Freshness: a quote dated before the latest session (a halted or stale
 *    symbol still reporting its last % change) is dropped, not ranked.
 *  - Direction: gainers must be up and losers down. On a quiet day a list is
 *    shorter rather than padded with a +0.1% "loser".
 */

import { after } from 'next/server';
import { getStockQuotes, TwelveDataRateLimitError } from '@/lib/twelvedata/twelvedata-client';
import { tryReserveCredits } from '@/lib/twelvedata/credit-budget';
import { rget, rset, rsetnx, rdel, getMarketSession } from '@/lib/cache/redis-cache';
import { SIGNIFICANT_TICKERS } from '@/lib/market-data/significant-tickers';
import { isDuplicateShareClass } from '@/lib/market-data/dual-class-shares';
import { attachCalendarMeta } from '@/lib/market-data/calendar-market-cap';

export interface IndexMover {
  symbol: string;
  name: string | null;
  logo_url: string | null;
  price: number;
  changePercent: number;
}

export interface IndexMovers {
  /** 'live' during the regular session, otherwise the last completed session. */
  session: 'live' | 'last';
  /** The trading day the moves belong to (YYYY-MM-DD, New York). */
  asOf: string | null;
  /** How many index members had a usable quote for that day. */
  ranked: number;
  gainers: IndexMover[];
  losers: IndexMover[];
}

const TOP_N = 10;
const QUOTE_CHUNK = 100;
const UNIVERSE = [...SIGNIFICANT_TICKERS].filter((t) => !isDuplicateShareClass(t));
/** Share of the index that must be quoted for the ranking to count. */
const MIN_COVERAGE = 0.98;
/** Extra passes over whatever is still unquoted. */
const RETRIES = 2;
const LOCK_KEY = 'movers:index:v1:lock';

/** Short while trading (the list moves), long otherwise (it cannot). */
const FRESH_KEY = 'movers:index:v1';
/** Last good result, served when a refresh is rate-limited or fails. */
const STALE_KEY = 'movers:index:v1:last';

function nyDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

/** Pure ranking step, exported for the self-check script. */
export function rankMovers(
  quotes: Map<string, { c: number; pc: number; dp: number; t: number }>,
  limit = TOP_N,
): { asOf: string | null; rows: { symbol: string; price: number; changePercent: number }[]; gainers: string[]; losers: string[] } {
  const valid = [...quotes.entries()].filter(
    ([, q]) => q.c > 0 && q.pc > 0 && Number.isFinite(q.dp) && Number.isFinite(q.t),
  );

  // The latest session is whichever date most quotes carry. A handful of
  // symbols dated earlier are halted or stale, and their % change is old news.
  const dayCounts = new Map<string, number>();
  for (const [, q] of valid) {
    const d = nyDate(q.t);
    dayCounts.set(d, (dayCounts.get(d) ?? 0) + 1);
  }
  const asOf = [...dayCounts.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? 1 : -1))[0]?.[0] ?? null;

  const rows = valid
    .filter(([, q]) => nyDate(q.t) === asOf)
    .map(([symbol, q]) => ({ symbol, price: q.c, changePercent: q.dp }));

  const gainers = rows.filter((r) => r.changePercent > 0).sort((a, b) => b.changePercent - a.changePercent).slice(0, limit);
  const losers = rows.filter((r) => r.changePercent < 0).sort((a, b) => a.changePercent - b.changePercent).slice(0, limit);
  return { asOf, rows, gainers: gainers.map((g) => g.symbol), losers: losers.map((l) => l.symbol) };
}

/**
 * Quotes the whole universe, paced against the shared credit budget.
 *
 * Firing all ~515 at once runs into the 610/min account cap, and
 * getStockQuotes drops a rate-limited symbol silently rather than throwing:
 * the first live run came back with the alphabetical tail (MET..ZTS) missing,
 * which would have ranked a biased two thirds of the index. So each chunk
 * waits for budget, and whatever is still missing gets retried.
 */
async function quoteUniverse(): Promise<Map<string, { c: number; pc: number; dp: number; t: number }>> {
  const quotes = new Map<string, { c: number; pc: number; dp: number; t: number }>();
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    const missing = UNIVERSE.filter((s) => !quotes.has(s));
    if (missing.length === 0) break;
    for (let i = 0; i < missing.length; i += QUOTE_CHUNK) {
      const chunk = missing.slice(i, i + QUOTE_CHUNK);
      if (!(await tryReserveCredits(chunk.length, 70_000))) continue;
      // prepost: false, always. See the definition above.
      const got = await getStockQuotes(chunk, { prepost: false });
      for (const [sym, q] of got) quotes.set(sym.toUpperCase(), q);
    }
  }
  return quotes;
}

async function computeMovers(): Promise<IndexMovers> {
  const quotes = await quoteUniverse();

  const { asOf, rows, gainers, losers } = rankMovers(quotes);
  const bySymbol = new Map(rows.map((r) => [r.symbol, r]));
  // No `name` key: attachCalendarMeta backfills it from screener_stats only when absent.
  const pick = (syms: string[]) => syms.map((s): { symbol: string; name?: string; price: number; changePercent: number } => bySymbol.get(s)!);
  const [g, l] = await Promise.all([attachCalendarMeta(pick(gainers)), attachCalendarMeta(pick(losers))]);
  const strip = (r: (typeof g)[number]): IndexMover => ({
    symbol: r.symbol,
    name: r.name ?? null,
    logo_url: r.logo_url,
    price: r.price,
    changePercent: r.changePercent,
  });

  // getMarketSession() knows weekends but not exchange holidays; on a holiday
  // the quotes are dated the previous session, which is what decides it.
  const live = getMarketSession() === 'regular' && asOf === nyDate(Date.now() / 1000);

  return {
    session: live ? 'live' : 'last',
    asOf,
    ranked: rows.length,
    gainers: g.map(strip),
    losers: l.map(strip),
  };
}

/**
 * Recomputes and caches the list. Takes a minute or two when the budget is
 * busy, so it never runs inside a user's request: the market-movers-daily
 * cron seeds it after the close, and getIndexMovers() schedules it after a
 * response when the cached list has expired. One refresh at a time.
 */
export async function refreshIndexMovers(): Promise<IndexMovers | null> {
  if (!(await rsetnx(LOCK_KEY, 5 * 60))) return null;
  try {
    const movers = await computeMovers();
    // A few index members can be genuinely unquotable; more than that means
    // the budget ran out, and a partial list would crown the wrong names.
    if (movers.ranked < UNIVERSE.length * MIN_COVERAGE) {
      console.warn(`[index-movers] only ${movers.ranked}/${UNIVERSE.length} quoted, keeping the last good list`);
      return null;
    }
    // The closing auction print reaches TwelveData a few minutes after 4pm, so
    // a list computed right after the bell carries pre-close prices (CEG
    // 253.59 vs its 253.97 close on 2026-09-30). Keep the short TTL until then.
    const session = getMarketSession();
    const etHHMM = Number(new Date().toLocaleTimeString('en-GB', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit' }).replace(':', ''));
    const settling = session === 'extended' && etHHMM >= 1600 && etHHMM < 1630;
    const open = session === 'regular';
    await Promise.all([
      rset(FRESH_KEY, movers, open || settling ? 5 * 60 : 30 * 60),
      rset(STALE_KEY, movers, 7 * 24 * 60 * 60),
    ]);
    return movers;
  } catch (err) {
    if (!(err instanceof TwelveDataRateLimitError)) console.error('[index-movers] refresh failed:', err);
    return null;
  } finally {
    await rdel(LOCK_KEY);
  }
}

/**
 * The cached list, instantly. When it has expired, the last good list is
 * returned and a refresh is scheduled to run after the response.
 */
export async function getIndexMovers(): Promise<IndexMovers | null> {
  const fresh = await rget<IndexMovers>(FRESH_KEY);
  if (fresh) return fresh;
  after(() => refreshIndexMovers());
  return rget<IndexMovers>(STALE_KEY);
}
