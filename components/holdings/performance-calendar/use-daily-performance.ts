'use client';

import { useQuery } from '@tanstack/react-query';
import type { DailyPerformanceDay } from '@/lib/holdings/daily-performance';
import type { MarketHoliday } from '@/lib/market/exchange-holidays';

interface DailyPerformanceResponse {
  success: boolean;
  month?: string;
  days?: DailyPerformanceDay[];
  holidays?: MarketHoliday[];
  error?: string;
}

export interface DailyPerformanceResult {
  days: DailyPerformanceDay[];
  holidays: MarketHoliday[];
  isLoading: boolean;
  /** True when TwelveData refused the request — render a gated note, not an error. */
  isGated: boolean;
  isError: boolean;
}

/**
 * Daily performance for one month (`YYYY-MM`).
 *
 * Everything the route returns is USD; conversion to the display currency
 * happens at render time from a single FX scalar, so the query cache stays
 * valid across a currency change and percentages never shift.
 *
 * Cached for the 10 minutes the server-side Redis entry lives, so paging back
 * and forth between months is free after the first visit.
 */
export function useDailyPerformance(month: string, enabled = true): DailyPerformanceResult {
  const query = useQuery<DailyPerformanceResponse>({
    queryKey: ['daily-performance', month],
    queryFn: async () => {
      const res = await fetch(`/api/holdings/daily-performance?month=${month}`);
      if (!res.ok) throw new Error('Failed to load daily performance');
      return res.json();
    },
    enabled,
    staleTime: 10 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: false,
  });

  return {
    days: query.data?.days ?? [],
    holidays: query.data?.holidays ?? [],
    isLoading: query.isLoading,
    isGated: query.data?.success === false,
    isError: query.isError,
  };
}
