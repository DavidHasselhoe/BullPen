'use client';

import { useQuery } from '@tanstack/react-query';
import type { MarketNews } from '@/lib/finnhub/finnhub-client';

interface MarketNewsResponse {
  success: boolean;
  news?: MarketNews[];
  error?: string;
}

/**
 * TanStack Query hook to fetch market news.
 * When symbols provided, fetches company news for those tickers and merges.
 */
export function useMarketNews(
  category: string = 'general',
  limit: number = 10,
  symbols?: string[] | null
) {
  const symbolsKey = symbols && symbols.length > 0 ? symbols.sort().join(',') : '';
  return useQuery({
    queryKey: ['market', 'news', category, limit, symbolsKey],
    queryFn: async (): Promise<MarketNews[]> => {
      const params = new URLSearchParams({ category });
      if (symbolsKey) params.set('symbols', symbolsKey);
      const response = await fetch(`/api/market/news?${params}`);
      const data: MarketNewsResponse = await response.json();

      if (data.success && data.news) {
        return data.news.slice(0, limit);
      }
      throw new Error(data.error || 'Failed to fetch market news');
    },
    enabled: !symbols || symbols.length > 0,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchInterval: false,
  });
}

