'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import type { ActivityItem } from '@/app/api/users/[username]/activity/route';

interface ActivityPage {
  success: boolean;
  items: ActivityItem[];
  nextCursor: string | null;
}

export function useProfileActivity(username: string) {
  return useInfiniteQuery<ActivityPage>({
    queryKey: ['profile-activity', username],
    queryFn: async ({ pageParam }) => {
      const url = pageParam
        ? `/api/users/${encodeURIComponent(username)}/activity?cursor=${encodeURIComponent(pageParam as string)}`
        : `/api/users/${encodeURIComponent(username)}/activity`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch activity');
      return res.json();
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    staleTime: 3 * 60 * 1000,
    refetchOnWindowFocus: false,
    enabled: !!username,
  });
}
