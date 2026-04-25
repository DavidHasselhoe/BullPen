'use client';

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';

export interface HealthScore {
  score: number;
  grade: string;
  label: string;
}

export interface EnhancedData {
  healthScore: HealthScore | null;
  nextEarningsDate: string | null;
  daysToEarnings: number | null;
  thesisSentiment: 'bull' | 'bear' | 'neutral' | null;
}

export type EnhancedDataMap = Record<string, EnhancedData>;

export function useWatchlistEnhanced(symbols: string[]) {
  const { isAuthenticated } = useAuth();
  const sorted = [...symbols].sort();

  return useQuery({
    queryKey: ['watchlist-enhanced', ...sorted],
    queryFn: async (): Promise<EnhancedDataMap> => {
      const res = await fetch('/api/watchlist/enhanced', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols: sorted }),
      });
      if (!res.ok) throw new Error('Failed to fetch enhanced data');
      const data = await res.json();
      return data.data ?? {};
    },
    enabled: isAuthenticated && sorted.length > 0,
    staleTime: 5 * 60 * 1000,
  });
}
