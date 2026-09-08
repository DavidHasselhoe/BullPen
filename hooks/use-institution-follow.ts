'use client';

/**
 * Follow state for one 13F fund, mirroring hooks/use-watchlist.ts: optimistic
 * toggle, rollback on error, invalidate on settle. The optimism matters more
 * than usual here because the button is the only feedback -- nothing else on
 * the page changes when you follow a fund.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';

interface FollowResponse {
  success: boolean;
  following: boolean;
}

export function useIsFollowingFund(slug: string) {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: ['institution-follow', slug],
    queryFn: async (): Promise<boolean> => {
      const res = await fetch(`/api/institutions/${slug}/follow`);
      if (!res.ok) return false;
      const json: FollowResponse = await res.json();
      return json.following;
    },
    enabled: isAuthenticated && !!slug,
    staleTime: 60 * 1000,
  });
}

export function useToggleFundFollow(slug: string) {
  const queryClient = useQueryClient();
  const key = ['institution-follow', slug];

  return useMutation({
    mutationFn: async (next: boolean): Promise<boolean> => {
      const res = await fetch(`/api/institutions/${slug}/follow`, {
        method: next ? 'POST' : 'DELETE',
      });
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      const json: FollowResponse = await res.json();
      return json.following;
    },
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<boolean>(key);
      queryClient.setQueryData(key, next);
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
