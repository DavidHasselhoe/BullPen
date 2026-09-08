'use client';

/**
 * The set of tickers the signed-in user actually holds, upper-cased, for
 * surfaces that want to mark "you own this" against some other list.
 *
 * Fails quiet by construction: useHoldings is already `enabled:
 * isAuthenticated`, so a logged-out visitor gets undefined, the set comes back
 * empty, and every caller's `.has()` is false. No loading branch, no empty
 * state, nothing to render for someone with no portfolio.
 *
 * Holdings only, not watchlist — "own" means own. A surface that wants to
 * distinguish owned from merely watched (the market calendar does) needs both
 * sets and should keep building them itself.
 */

import { useMemo } from 'react';
import { useHoldings } from '@/hooks/use-holdings';

export function useOwnedSymbols(): Set<string> {
  const { data: holdings } = useHoldings();

  return useMemo(() => {
    const set = new Set<string>();
    for (const h of holdings ?? []) {
      if (h.symbol) set.add(h.symbol.toUpperCase());
    }
    return set;
  }, [holdings]);
}
