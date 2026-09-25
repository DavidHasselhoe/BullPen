'use client';

/**
 * Follow state for 13F funds and tracked politicians, fetched once as a set of
 * slugs rather than per item: the Discover grids render a card per fund or
 * member and asking each one separately would be a request per card.
 *
 * Toggling mirrors hooks/use-watchlist.ts — optimistic patch, rollback on
 * error, invalidate on settle. The optimism matters more than usual because
 * the button is the only feedback; nothing else on the page changes when you
 * follow.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';

export type FollowKind = 'institution' | 'politician';

const BASE: Record<FollowKind, string> = {
  institution: '/api/institutions',
  politician: '/api/congress',
};

const followsKey = (kind: FollowKind) => [`${kind}-follows`] as const;

export function useFollowedSlugs(kind: FollowKind) {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: followsKey(kind),
    queryFn: async (): Promise<string[]> => {
      const res = await fetch(`${BASE[kind]}/follows`);
      if (!res.ok) return [];
      const json: { slugs?: string[] } = await res.json();
      return json.slugs ?? [];
    },
    enabled: isAuthenticated,
    staleTime: 60 * 1000,
  });
}

/** True when the signed-in user follows this slug. False while loading and
 *  false when logged out, so the button never flashes the wrong state. */
export function useIsFollowing(kind: FollowKind, slug: string): boolean {
  const { data } = useFollowedSlugs(kind);
  return (data ?? []).includes(slug);
}

export function useToggleFollow(kind: FollowKind, slug: string) {
  const queryClient = useQueryClient();
  const key = followsKey(kind);

  return useMutation({
    mutationFn: async (next: boolean): Promise<boolean> => {
      const res = await fetch(`${BASE[kind]}/${slug}/follow`, {
        method: next ? 'POST' : 'DELETE',
      });
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      const json: { following: boolean } = await res.json();
      return json.following;
    },
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<string[]>(key);
      queryClient.setQueryData<string[]>(key, (old) => {
        const set = new Set(old ?? []);
        if (next) set.add(slug);
        else set.delete(slug);
        return [...set];
      });
      return { previous };
    },
    onError: (_err, _next, ctx) => {
      if (ctx?.previous !== undefined) queryClient.setQueryData(key, ctx.previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: key });
    },
  });
}

// Fund-specific names kept for the existing 13F call sites.
export const useFollowedFunds = () => useFollowedSlugs('institution');
export const useIsFollowingFund = (slug: string) => useIsFollowing('institution', slug);
export const useToggleFundFollow = (slug: string) => useToggleFollow('institution', slug);
