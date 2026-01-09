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
 * Polls every 3 seconds if data is missing
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
      // Poll every 3 seconds if company doesn't exist or has no data yet
      const data = query.state.data;
      if (!data || !data.companyExists || !data.hasAnyData) {
        return 3000; // 3 seconds
      }
      // Stop polling once we have data
      return false;
    },
    staleTime: 1000, // 1 second - allow refetching quickly
  });
}
