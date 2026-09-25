/**
 * Top movers with company names and logos attached.
 *
 * Shared by /api/market/movers and by the dashboard's server render, so the
 * browser can be handed movers that are already resolved instead of fetching
 * them after hydration and then fetching their names separately.
 */

import { getMarketMovers, getTopMoversForSymbols } from '@/lib/twelvedata/twelvedata-client';
import { createServerClient } from '@/lib/supabase/client';
import { rget, rset } from '@/lib/cache/redis-cache';
import { getDisplayNames } from './display-names';

/** 30s: fresh enough for a live dashboard, cheap enough for concurrent users. */
const MOVERS_TTL = 30;

type Movers = Awaited<ReturnType<typeof getTopMoversForSymbols>>;

function moversKey(symbols: string[], limit: number): string {
  return `movers:${limit}:${[...new Set(symbols)].sort().join(',')}`;
}

/**
 * Fill in company name and logo from our own tables.
 *
 * Deliberately non-fatal: movers without a name still render as a ticker, which
 * is what happened before this existed, so a slow or failing lookup must not
 * cost the whole response.
 */
async function withCompanyDetails<T extends { symbol: string; name?: string | null }>(
  movers: T[]
): Promise<Array<T & { logo_url?: string | null }>> {
  const tickers = [...new Set(movers.map((m) => m.symbol.toUpperCase()))];
  if (tickers.length === 0) return movers;
  try {
    const supabase = createServerClient();
    const [{ data }, names] = await Promise.all([
      supabase.from('companies').select('ticker, logo_url').in('ticker', tickers),
      getDisplayNames(tickers),
    ]);
    const logos = new Map(
      ((data ?? []) as Array<{ ticker: string; logo_url: string | null }>)
        .map((r) => [r.ticker.toUpperCase(), r.logo_url])
    );
    return movers.map((m) => {
      const key = m.symbol.toUpperCase();
      return { ...m, name: names.get(key) ?? m.name, logo_url: logos.get(key) ?? null };
    });
  } catch {
    return movers;
  }
}

export async function getEnrichedMovers(
  limit: number,
  symbols: string[] | null
): Promise<Movers> {
  let gainers: Movers['gainers'];
  let losers: Movers['losers'];

  if (symbols && symbols.length > 0) {
    // Custom symbol set (holdings / watchlist) — cache in Redis so concurrent
    // users with the same portfolio don't each hit TwelveData independently.
    const key = moversKey(symbols, limit);
    const cached = await rget<{ gainers: Movers['gainers']; losers: Movers['losers'] }>(key);
    if (cached) {
      ({ gainers, losers } = cached);
    } else {
      ({ gainers, losers } = await getTopMoversForSymbols(symbols, limit));
      void rset(key, { gainers, losers }, MOVERS_TTL);
    }
  } else {
    // All-markets path — shared Redis cache lives inside getMarketMovers, which
    // the dashboard server render calls directly (no CDN in front of that).
    ({ gainers, losers } = await getMarketMovers('stocks', limit));
  }

  const enriched = await withCompanyDetails([...gainers, ...losers]);
  const byTicker = new Map(enriched.map((m) => [m.symbol, m]));

  return {
    gainers: gainers.map((g) => byTicker.get(g.symbol) ?? g),
    losers: losers.map((l) => byTicker.get(l.symbol) ?? l),
  };
}
