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
  /** The user's own latest thesis text on this stock. */
  thesisText: string | null;
  marketCap: number | null;
  peRatio: number | null;
  week52High: number | null;
  week52Low: number | null;
}

export type EnhancedDataMap = Record<string, EnhancedData>;

/** /api/watchlist/enhanced's per-request cap. */
const ENHANCED_CHUNK = 50;

export function useWatchlistEnhanced(symbols: string[]) {
  const { isAuthenticated } = useAuth();
  const sorted = [...symbols].sort();

  return useQuery({
    queryKey: ['watchlist-enhanced', ...sorted],
    queryFn: async (): Promise<EnhancedDataMap> => {
      // The route takes at most 50 symbols and the page sends every list's;
      // past 50 a single request was a 400 and every card lost its data.
      const chunks: string[][] = [];
      for (let i = 0; i < sorted.length; i += ENHANCED_CHUNK) chunks.push(sorted.slice(i, i + ENHANCED_CHUNK));
      const parts = await Promise.all(chunks.map(async (chunk) => {
        const res = await fetch('/api/watchlist/enhanced', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbols: chunk }),
        });
        if (!res.ok) throw new Error('Failed to fetch enhanced data');
        const data = await res.json();
        return (data.data ?? {}) as EnhancedDataMap;
      }));
      return Object.assign({}, ...parts);
    },
    enabled: isAuthenticated && sorted.length > 0,
    staleTime: 5 * 60 * 1000,
  });
}
