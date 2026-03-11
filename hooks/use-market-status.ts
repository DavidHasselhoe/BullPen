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

const THIRTY_MINUTES_MS = 30 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;

/**
 * Returns the appropriate refetch interval based on how close a market state change is.
 * Under 30 min → 5s (live countdown feel)
 * 30 min – 1 hr → 30s (moderate updates)
 * Over 1 hr → 60s (infrequent, saves re-renders)
 */
function getRefetchInterval(timeUntilMs: number | null): number {
  if (timeUntilMs === null) return ONE_HOUR_MS;
  if (timeUntilMs <= THIRTY_MINUTES_MS) return 5_000;
  if (timeUntilMs <= ONE_HOUR_MS) return 30_000;
  return 60_000;
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
    refetchInterval: (query) => {
      const status = query.state.data;
      if (!status) return 5_000;
      const timeUntil = status.isOpen ? status.timeUntilClose : status.timeUntilOpen;
      return getRefetchInterval(timeUntil);
    },
    staleTime: 0,
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
    refetchInterval: (query) => {
      const statuses = query.state.data;
      if (!statuses || Object.keys(statuses).length === 0) return 5_000;
      // Use the smallest time-until-change across all tracked exchanges
      const times = Object.values(statuses)
        .map((s) => (s.isOpen ? s.timeUntilClose : s.timeUntilOpen))
        .filter((t): t is number => t !== null);
      const minTime = times.length > 0 ? Math.min(...times) : null;
      return getRefetchInterval(minTime);
    },
    staleTime: 0,
  });
}
