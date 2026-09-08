'use client';

/**
 * Follow state for the 13F funds, fetched once as a set of slugs rather than
 * per fund: the Discover grid renders fifteen cards at a time and asking each
 * one separately would be fifteen requests to draw one section.
 *
 * Toggling mirrors hooks/use-watchlist.ts — optimistic patch, rollback on
 * error, invalidate on settle. The optimism matters more than usual because
 * the button is the only feedback; nothing else on the page changes when you
 * follow a fund.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';

const FOLLOWS_KEY = ['institution-follows'] as const;

export function useFollowedFunds() {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: FOLLOWS_KEY,
    queryFn: async (): Promise<string[]> => {
      const res = await fetch('/api/institutions/follows');
      if (!res.ok) return [];
      const json: { slugs?: string[] } = await res.json();
      return json.slugs ?? [];
    },
    enabled: isAuthenticated,
    staleTime: 60 * 1000,
  });
}

/** True when the signed-in user follows this fund. False while loading and
 *  false when logged out, so the button never flashes the wrong state. */
export function useIsFollowingFund(slug: string): boolean {
  const { data } = useFollowedFunds();
  return (data ?? []).includes(slug);
}

export function useToggleFundFollow(slug: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (next: boolean): Promise<boolean> => {
      const res = await fetch(`/api/institutions/${slug}/follow`, {
        method: next ? 'POST' : 'DELETE',
      });
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      const json: { following: boolean } = await res.json();
      return json.following;
    },
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey: FOLLOWS_KEY });
      const previous = queryClient.getQueryData<string[]>(FOLLOWS_KEY);
      queryClient.setQueryData<string[]>(FOLLOWS_KEY, (old) => {
        const set = new Set(old ?? []);
        if (next) set.add(slug);
        else set.delete(slug);
        return [...set];
      });
      return { previous };
    },
    onError: (_err, _next, ctx) => {
      if (ctx?.previous !== undefined) queryClient.setQueryData(FOLLOWS_KEY, ctx.previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: FOLLOWS_KEY });
    },
  });
}
