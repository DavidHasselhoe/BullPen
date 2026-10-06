'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchHoldingQuotes } from '@/lib/holdings/holding-quotes';
import { useTradingSession } from '@/hooks/use-trading-session';

/**
 * Day change for recently viewed tickers, through the same quote path and
 * session rule as Home's portfolio hero. It used the plain batcher, which
 * before the open still reports yesterday's session, so one screen showed AMD
 * at +1.62% (hero, pre-market) and -0.34% (these chips) at the same time.
 */
export function useRecentlyViewedQuotes(tickers: string[]) {
  const prepost = useTradingSession() !== 'regular';
  return useQuery<Record<string, { changePercent: number }>>({
    queryKey: ['recently-viewed-quotes', tickers, prepost],
    queryFn: () => fetchHoldingQuotes(tickers, [], prepost),
    enabled: tickers.length > 0,
    staleTime: 2 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });
}
