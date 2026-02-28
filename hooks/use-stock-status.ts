import { useQuery } from '@tanstack/react-query';

interface StockStatus {
  companyExists: boolean;
  filingsCount: number;
  metricsCount: number;
  trendsCount: number;
  hasAnyData: boolean;
}

interface StockStatusResponse {
  success: boolean;
  status?: StockStatus;
  error?: string;
}

/**
 * TanStack Query hook to check stock ingestion status
 * Polls every 8 seconds if data is missing (reduced from 3s to lower Supabase load)
 */
export function useStockStatus(ticker: string, enabled: boolean = true) {
  return useQuery({
    queryKey: ['stock-status', ticker],
    queryFn: async (): Promise<StockStatus | null> => {
      const response = await fetch(`/api/stock/${ticker}/status`);
      const data: StockStatusResponse = await response.json();

      if (data.success && data.status) {
        return data.status;
      }
      return null;
    },
    enabled: enabled && !!ticker,
    refetchInterval: (query) => {
      // Poll every 8 seconds if company doesn't exist or has no data yet
      const data = query.state.data;
      if (!data || !data.companyExists || !data.hasAnyData) {
        return 8000; // 8 seconds - balance UX with Supabase CPU load
      }
      return false;
    },
    staleTime: 5000, // 5 seconds - reduce unnecessary refetches
  });
}
