'use client';

import { useQuery } from '@tanstack/react-query';

/**
 * Fetches 1-month daily closing prices for all holdings in a single batch
 * request instead of N individual candle calls.
 *
 * Returns a map of { symbol → number[] } so each SparklineCell can read its
 * prices by symbol without triggering its own network request.
 */
export function useHoldingsSparklines(symbols: string[]): Record<string, number[]> {
  const key = symbols.slice().sort().join(',');

  const { data } = useQuery<Record<string, number[]>>({
    queryKey: ['holdings-sparklines', key],
    queryFn: async () => {
      if (symbols.length === 0) return {};
      const res = await fetch(`/api/holdings/sparklines?symbols=${encodeURIComponent(symbols.join(','))}`);
      if (!res.ok) return {};
      const json = await res.json();
      return (json.sparklines as Record<string, number[]>) ?? {};
    },
    enabled: symbols.length > 0,
    staleTime: 20 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    // Sparklines are decorative — don't refetch on window focus or reconnect.
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  return data ?? {};
}
