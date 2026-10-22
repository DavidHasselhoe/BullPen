import { createServerClient } from '@/lib/supabase/client';
import { getStockQuotes } from '@/lib/twelvedata/twelvedata-client';
import { tryReserveOrganicCredits } from '@/lib/twelvedata/credit-budget';
import { getLastPrices, cacheLastPrice } from '@/lib/market-data/last-price-cache';
import { getLogoUrlsForTickers } from '@/lib/logos/logos-db';
import { getDisplayNames } from '@/lib/market-data/display-names';
import { displayCompanyName } from '@/lib/market-data/company-name';
import { BENCHMARK, getSinceAddedEntries } from '@/lib/watchlist/since-added';
import { listScore, pickReturn, type ListScore, type SinceAddedEntry } from '@/lib/watchlist/scorecard';

/** 16 url-safe characters from 12 random bytes: unguessable, short enough to paste. */
export const SHARE_TOKEN_RE = /^[A-Za-z0-9_-]{16}$/;

export interface SharedListStock {
  symbol: string;
  name: string;
  logoUrl: string | null;
  addedAt: string;
  price: number | null;
  changePercent: number | null;
  /** Since it was added, percent; null when added today or unpriced. */
  sinceAdded: number | null;
}

export interface SharedList {
  name: string;
  color: string | null;
  sharedAt: string | null;
  stocks: SharedListStock[];
  score: ListScore | null;
  asOf: string;
}

/**
 * Everything the public /lists/<token> page shows, read with the service role
 * because a visitor has no session. Only what the owner agreed to share: the
 * list's name, its stocks and how they have done. Never their name, holdings,
 * alerts, plans or other lists.
 *
 * Prices come from the shared last-price cache first; only the misses are
 * quoted, under the organic credit budget. The page caches the whole result
 * (ISR), so a link that spreads costs at most one quote per stock per refresh.
 */
export async function getSharedList(token: string): Promise<SharedList | null> {
  if (!SHARE_TOKEN_RE.test(token)) return null;
  const supabase = createServerClient();

  const { data: list } = await supabase
    .from('watchlist_lists')
    .select('id, user_id, name, color, shared_at')
    .eq('share_token', token)
    .maybeSingle();
  if (!list) return null;

  const { data: rows } = await supabase
    .from('user_watchlist')
    .select('symbol, company_name, added_at')
    .eq('list_id', list.id)
    .order('added_at', { ascending: true });
  const items = (rows ?? []) as { symbol: string; company_name: string; added_at: string }[];
  const symbols = items.map((i) => i.symbol);

  const [logos, names, entries, prices] = await Promise.all([
    getLogoUrlsForTickers(symbols),
    getDisplayNames(symbols),
    // A rate-limited closes fetch leaves the record out rather than the page.
    getSinceAddedEntries(list.user_id, list.id).catch((): SinceAddedEntry[] => []),
    pricesFor([...symbols, BENCHMARK]),
  ]);

  const priceOf = (s: string) => prices.get(s.toUpperCase())?.price ?? null;
  const benchPrice = priceOf(BENCHMARK);
  const current = new Map(entries.filter((e) => !e.removedAt).map((e) => [e.symbol, e]));

  return {
    name: list.name,
    color: list.color,
    sharedAt: list.shared_at,
    stocks: items.map((i) => {
      const entry = current.get(i.symbol);
      return {
        symbol: i.symbol,
        name: names.get(i.symbol.toUpperCase()) ?? displayCompanyName(i.company_name || i.symbol, i.symbol),
        logoUrl: logos.get(i.symbol) ?? null,
        addedAt: i.added_at,
        price: priceOf(i.symbol),
        changePercent: prices.get(i.symbol.toUpperCase())?.changePercent ?? null,
        sinceAdded: entry ? pickReturn(entry, priceOf(i.symbol), benchPrice)?.pct ?? null : null,
      };
    }),
    score: listScore(entries, priceOf, benchPrice),
    asOf: new Date().toISOString(),
  };
}

async function pricesFor(symbols: string[]) {
  const prices = await getLastPrices(symbols);
  const missing = [...new Set(symbols.map((s) => s.toUpperCase()))].filter((s) => !prices.has(s));
  if (missing.length > 0 && (await tryReserveOrganicCredits(missing.length))) {
    try {
      const quotes = await getStockQuotes(missing);
      for (const [symbol, q] of quotes) {
        if (!(q.c > 0)) continue;
        const seed = { price: q.c, changePercent: Number.isFinite(q.dp) ? q.dp : null };
        prices.set(symbol.toUpperCase(), seed);
        cacheLastPrice(symbol, seed);
      }
    } catch (err) {
      // A missing price shows as a dash; the page still renders.
      console.warn('[shared-list] quotes failed:', err instanceof Error ? err.message : err);
    }
  }
  return prices;
}
