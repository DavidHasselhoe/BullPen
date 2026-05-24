'use client';

import { useQuery } from '@tanstack/react-query';
import type { AcademyStats } from '@/types/academy';

const EMPTY_STATS: AcademyStats = {
  totalXp: 0,
  currentStreak: 0,
  longestStreak: 0,
  lastActivityDate: null,
  level: 1,
};

interface StatsResponse {
  success: boolean;
  stats: AcademyStats;
}

export const ACADEMY_STATS_QUERY_KEY = ['academy-stats'] as const;

export function useAcademyStats() {
  return useQuery<AcademyStats>({
    queryKey: ACADEMY_STATS_QUERY_KEY,
    queryFn: async () => {
      const res = await fetch('/api/academy/stats');
      if (!res.ok) return EMPTY_STATS;
      const data: StatsResponse = await res.json();
      return data.stats ?? EMPTY_STATS;
    },
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
  });
}
