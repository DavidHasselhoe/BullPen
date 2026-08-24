'use client';

import { useAuth } from '@/hooks/use-auth';
import { useWatchlistLists } from '@/hooks/use-watchlist';
import { MAX_FREE_WATCHLISTS } from '@/lib/watchlist/limits';
import { isPro, tierFromUser } from '@/lib/billing/tier';

export function useWatchlistLimits() {
  const { user } = useAuth();
  const { data: lists } = useWatchlistLists();

  const listCount = lists?.length ?? 0;
  const userIsPro = isPro(tierFromUser(user?.account_tier ?? null, user?.role ?? null, user?.pro_bonus_until ?? null));
  const maxLists = userIsPro ? Infinity : MAX_FREE_WATCHLISTS;
  const canCreateList = userIsPro || listCount < MAX_FREE_WATCHLISTS;

  return { canCreateList, listCount, maxLists };
}
