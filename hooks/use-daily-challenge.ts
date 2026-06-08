'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ACADEMY_STATS_QUERY_KEY } from '@/hooks/use-academy-stats';
import type { AcademyStats } from '@/types/academy';

export interface DailyChallenge {
  id: string;
  question: string;
  options: string[];
  xpReward: number;
}

export interface DailyChallengeState {
  challenge: DailyChallenge | null;
  alreadyDoneToday: boolean;
  wasCorrect: boolean | null;
  xpEarned: number | null;
}

export interface DailySubmitResult {
  alreadyDoneToday: boolean;
  correctIndex: number;
  wasCorrect: boolean;
  explanation: string;
  xpAwarded: number;
  stats: AcademyStats;
}

const DAILY_QUERY_KEY = ['academy-daily'] as const;

export function useDailyChallenge() {
  const queryClient = useQueryClient();

  const query = useQuery<DailyChallengeState>({
    queryKey: DAILY_QUERY_KEY,
    queryFn: async () => {
      const res = await fetch('/api/academy/daily');
      if (!res.ok) return { challenge: null, alreadyDoneToday: false, wasCorrect: null, xpEarned: null };
      const data = await res.json();
      return {
        challenge: data.challenge ?? null,
        alreadyDoneToday: data.alreadyDoneToday ?? false,
        wasCorrect: data.wasCorrect ?? null,
        xpEarned: data.xpEarned ?? null,
      };
    },
    staleTime: 60 * 1000,
  });

  const submit = useMutation<DailySubmitResult, Error, { challengeId: string; choiceIndex: number }>({
    mutationFn: async ({ challengeId, choiceIndex }) => {
      const res = await fetch('/api/academy/daily', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeId, choiceIndex }),
      });
      if (!res.ok) throw new Error('Failed to submit answer');
      return res.json();
    },
    onSuccess: () => {
      // Refresh the XP bar (streak + XP) and the challenge state.
      queryClient.invalidateQueries({ queryKey: ACADEMY_STATS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: DAILY_QUERY_KEY });
    },
  });

  return { ...query, submit };
}
