'use client';

import { useQuery } from '@tanstack/react-query';
import { useMoversStream } from '@/hooks/use-movers-stream';
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

/**
 * TanStack Query hook to fetch top market movers (gainers/losers).
 * When symbols provided, fetches movers from those tickers only (e.g. user holdings).
 */
export function useTopMovers(limit: number = 5, symbols?: string[] | null) {
  const symbolsKey = symbols && symbols.length > 0 ? symbols.sort().join(',') : '';
  return useQuery({
    queryKey: ['market', 'movers', limit, symbolsKey],
    queryFn: async (): Promise<TopMovers> => {
      const params = new URLSearchParams({ limit: String(limit) });
      if (symbolsKey) params.set('symbols', symbolsKey);
      const response = await fetch(`/api/market/movers?${params}`);
      const data: TopMoversResponse = await response.json();

      if (data.success && data.movers) {
        return data.movers;
      }
      throw new Error(data.error || 'Failed to fetch top movers');
    },
    enabled: !symbols || symbols.length > 0, // If symbols provided but empty, skip
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchInterval: false,
  });
}

/**
 * Fetches top movers with WebSocket stream when in "All markets" mode (no symbols).
 * Uses Twelve Data WebSocket credits instead of API credits.
 * Falls back to REST when stream returns 503 or on error.
 */
export function useTopMoversWithStream(limit: number = 5, symbols?: string[] | null) {
  const isAllMarkets = !symbols || symbols.length === 0;
  const stream = useMoversStream(limit);
  const symbolsKey = symbols && symbols.length > 0 ? symbols.sort().join(',') : '';
  const rest = useQuery({
    queryKey: ['market', 'movers', 'rest', limit, symbolsKey],
    queryFn: async (): Promise<TopMovers> => {
      const params = new URLSearchParams({ limit: String(limit) });
      if (symbolsKey) params.set('symbols', symbolsKey);
      const response = await fetch(`/api/market/movers?${params}`);
      const data: TopMoversResponse = await response.json();
      if (data.success && data.movers) return data.movers;
      throw new Error(data.error || 'Failed to fetch top movers');
    },
    enabled: !isAllMarkets || !!stream.error,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  if (isAllMarkets && stream.data) {
    return {
      data: stream.data,
      isLoading: stream.isLoading,
      error: stream.error,
      isStreaming: stream.isStreaming,
    };
  }
  return {
    data: rest.data,
    isLoading: rest.isLoading,
    error: rest.error,
    isStreaming: false,
  };
}