'use client';

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { PRICING } from '@/lib/billing/entitlements';

/**
 * The signed-in user's Pro trial length (30 days after an invite, else 7),
 * from the same function checkout uses. Signed out, or if the request fails,
 * it is the usual trial. `isLoading` lets a page hold its offer until the
 * number is known instead of flashing 7 then 30.
 */
export function useTrialDays(): { days: number; isLoading: boolean } {
  const { user } = useAuth();
  const userId = user?.id;
  const { data, isLoading } = useQuery({
    queryKey: ['trial-days', userId],
    queryFn: async () => {
      const res = await fetch('/api/billing/trial');
      if (!res.ok) return PRICING.trialDays;
      const body = (await res.json()) as { days?: number };
      return body.days ?? PRICING.trialDays;
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
  });
  return { days: data ?? PRICING.trialDays, isLoading: !!userId && isLoading };
}
