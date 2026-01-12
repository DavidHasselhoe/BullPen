import { useQuery } from '@tanstack/react-query';
import type { MarketNews, TopMovers } from '@/lib/finnhub/finnhub-client';

interface MarketNewsResponse {
  success: boolean;
  news?: MarketNews[];
  error?: string;
}

interface TopMoversResponse {
  success: boolean;
  movers?: TopMovers;
  error?: string;
}

/**
 * TanStack Query hook to fetch market news
 */
export function useMarketNews(category: string = 'general', limit: number = 10) {
  return useQuery({
    queryKey: ['market', 'news', category, limit],
    queryFn: async (): Promise<MarketNews[]> => {
      const response = await fetch(`/api/market/news?category=${category}`);
      const data: MarketNewsResponse = await response.json();

      if (data.success && data.news) {
        return data.news.slice(0, limit);
      }
      throw new Error(data.error || 'Failed to fetch market news');
    },
    staleTime: 10 * 60 * 1000, // 10 minutes - news doesn't change frequently
    gcTime: 30 * 60 * 1000, // Keep in cache for 30 minutes
    refetchInterval: false, // Disable automatic refetching - rely on staleTime
  });
}

/**
 * TanStack Query hook to fetch top market movers (gainers/losers)
 */
export function useTopMovers(limit: number = 5) {
  return useQuery({
    queryKey: ['market', 'movers', limit],
    queryFn: async (): Promise<TopMovers> => {
      const response = await fetch(`/api/market/movers?limit=${limit}`);
      const data: TopMoversResponse = await response.json();

      if (data.success && data.movers) {
        return data.movers;
      }
      throw new Error(data.error || 'Failed to fetch top movers');
    },
    staleTime: 5 * 60 * 1000, // 5 minutes - market movers don't change that frequently
    gcTime: 15 * 60 * 1000, // Keep in cache for 15 minutes
    refetchInterval: false, // Disable automatic refetching - rely on staleTime
  });
}