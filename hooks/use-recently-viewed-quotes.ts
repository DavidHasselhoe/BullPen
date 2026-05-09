'use client';

import { useQuery } from '@tanstack/react-query';

export function useRecentlyViewedQuotes(tickers: string[]) {
  return useQuery<Record<string, { changePercent: number }>>({
    queryKey: ['recently-viewed-quotes', tickers],
    queryFn: async () => {
      if (tickers.length === 0) return {};
      const res = await fetch('/api/quotes/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols: tickers }),
      });
      const json = await res.json();
      return json.quotes ?? {};
    },
    enabled: tickers.length > 0,
    staleTime: 2 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });
}
