import { useQuery } from '@tanstack/react-query';
import type { StockQuote } from '@/lib/finnhub/finnhub-client';

interface StockQuoteResponse {
  success: boolean;
  quote?: StockQuote;
  error?: string;
}

/**
 * TanStack Query hook to fetch stock quote
 */
export function useStockQuote(ticker: string | null) {
  return useQuery({
    queryKey: ['stock-quote', ticker],
    queryFn: async (): Promise<StockQuote> => {
      if (!ticker) {
        throw new Error('Ticker is required');
      }

      const response = await fetch(`/api/stock/${ticker}/quote`);
      const data: StockQuoteResponse = await response.json();

      if (data.success && data.quote) {
        return data.quote;
      }
      throw new Error(data.error || 'Failed to fetch stock quote');
    },
    enabled: !!ticker,
    staleTime: 2 * 60 * 1000, // 2 minutes - quotes don't change that frequently
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
    refetchInterval: false, // Disable automatic refetching - rely on staleTime
  });
}