'use client';

import { useQuery } from '@tanstack/react-query';
import type { EarningsCalendar as EarningsItem } from '@/lib/finnhub/finnhub-client';

interface EarningsCalendarResponse {
  success: boolean;
  earnings?: EarningsItem[];
  error?: string;
}

/**
 * Shared earnings-history query — same queryKey used by EarningsCalendar and
 * FinancialsSection so both consume one fetch/cache instead of two.
 */
export function useEarningsHistory(ticker: string) {
  return useQuery<EarningsItem[]>({
    queryKey: ['earnings-history', ticker],
    queryFn: async () => {
      const historyFrom = new Date(Date.now() - 455 * 86_400_000).toISOString().split('T')[0];
      const to = new Date(Date.now() + 120 * 86_400_000).toISOString().split('T')[0];
      const res = await fetch(`/api/stock/${ticker}/earnings-calendar?from=${historyFrom}&to=${to}`);
      if (!res.ok) return [];
      const result: EarningsCalendarResponse = await res.json();
      if (!result.success || !result.earnings) return [];
      // Finnhub returns a company's full earnings history when `symbol` is set,
      // ignoring from/to — clip to the requested window ourselves so a stray
      // decade-old record (seen on some ETFs) can't slip into "Recent Reports".
      return result.earnings.filter((e) => e.date >= historyFrom);
    },
    enabled: !!ticker,
    staleTime: 1000 * 60 * 60 * 6,
    gcTime: 1000 * 60 * 60 * 6,
  });
}
