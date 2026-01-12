'use client';

import { useQuery } from '@tanstack/react-query';
import { calculateMarketStatus } from '@/lib/market/market-status';
import type { Exchange, ExchangeHoliday, MarketStatus } from '@/lib/types/database';

interface ExchangesResponse {
  success: boolean;
  exchanges?: Exchange[];
  holidays?: ExchangeHoliday[];
  error?: string;
}

/**
 * Fetches exchanges and their holidays
 */
export function useExchanges() {
  return useQuery<{ exchanges: Exchange[]; holidays: ExchangeHoliday[] }, Error>({
    queryKey: ['exchanges'],
    queryFn: async () => {
      const response = await fetch('/api/exchanges');
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch exchanges');
      }
      const data: ExchangesResponse = await response.json();
      if (!data.success || !data.exchanges) {
        throw new Error(data.error || 'Failed to fetch exchanges');
      }
      return {
        exchanges: data.exchanges,
        holidays: data.holidays || [],
      };
    },
    staleTime: 60 * 60 * 1000, // 1 hour - exchange data doesn't change often
    gcTime: 24 * 60 * 60 * 1000, // 24 hours
  });
}

/**
 * Calculates market status for a specific exchange
 */
export function useMarketStatus(exchangeCode: string | null) {
  const { data, isLoading } = useExchanges();

  return useQuery<MarketStatus | null, Error>({
    queryKey: ['market-status', exchangeCode],
    queryFn: () => {
      if (!exchangeCode || !data) return null;

      const exchange = data.exchanges.find((e) => e.code === exchangeCode);
      if (!exchange) return null;

      const exchangeHolidays = data.holidays.filter((h) => h.exchange_code === exchangeCode);
      return calculateMarketStatus(exchange, exchangeHolidays);
    },
    enabled: !!exchangeCode && !!data && !isLoading,
    refetchInterval: 1000, // Update every second for real-time countdown
    staleTime: 0, // Always refetch to get current time
  });
}

/**
 * Calculates market status for multiple exchanges
 */
export function useMultipleMarketStatus(exchangeCodes: string[]) {
  const { data, isLoading } = useExchanges();

  return useQuery<Record<string, MarketStatus>, Error>({
    queryKey: ['market-status-multiple', exchangeCodes.sort().join(',')],
    queryFn: () => {
      if (!data) return {};

      const statusMap: Record<string, MarketStatus> = {};
      
      exchangeCodes.forEach((code) => {
        const exchange = data.exchanges.find((e) => e.code === code);
        if (exchange) {
          const exchangeHolidays = data.holidays.filter((h) => h.exchange_code === code);
          statusMap[code] = calculateMarketStatus(exchange, exchangeHolidays);
        }
      });

      return statusMap;
    },
    enabled: !!data && !isLoading && exchangeCodes.length > 0,
    refetchInterval: 1000, // Update every second for real-time countdown
    staleTime: 0, // Always refetch to get current time
  });
}
