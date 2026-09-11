'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchQuotesBatched } from '@/lib/market-data/quote-batcher';

export function useRecentlyViewedQuotes(tickers: string[]) {
  return useQuery<Record<string, { changePercent: number }>>({
    queryKey: ['recently-viewed-quotes', tickers],
    queryFn: async () => {
      if (tickers.length === 0) return {};
      return await fetchQuotesBatched(tickers);
    },
    enabled: tickers.length > 0,
    staleTime: 2 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });
}
