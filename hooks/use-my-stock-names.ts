'use client';

import { useHoldings } from '@/hooks/use-holdings';
import { useWatchlist } from '@/hooks/use-watchlist';
import { displayCompanyName } from '@/lib/market-data/company-name';

/**
 * Display names of what this person owns, then what they watch, for copy
 * written around their own stocks (Bull's first prompts, the first-week
 * checklist). Companies and funds come before crypto and forex pairs
 * (BTC/USD-style): "Is Bitcoin expensive?" has no P/E to answer with.
 */
export function useMyStockNames(): string[] {
  const { data: holdings } = useHoldings();
  const { data: watchlist } = useWatchlist();
  const picks: { symbol: string; name: string }[] = [];
  const seen = new Set<string>();
  const add = (symbol: string, name: string) => {
    if (seen.has(symbol)) return;
    seen.add(symbol);
    picks.push({ symbol, name: displayCompanyName(name || symbol, symbol) });
  };
  for (const h of holdings ?? []) if ((h.quantity ?? 0) > 0) add(h.symbol, h.company_name);
  for (const w of watchlist ?? []) add(w.symbol, w.display_name || w.company_name);
  return [...picks.filter((p) => !p.symbol.includes('/')), ...picks.filter((p) => p.symbol.includes('/'))].map((p) => p.name);
}
