'use client';

import { useAuth } from '@/hooks/use-auth';
import { useWatchlistLists } from '@/hooks/use-watchlist';
import { MAX_FREE_WATCHLISTS } from '@/lib/watchlist/limits';

export function useWatchlistLimits() {
  const { user } = useAuth();
  const { data: lists } = useWatchlistLists();

  const listCount = lists?.length ?? 0;
  const tier = user?.account_tier ?? 'free';
  const isPro = tier === 'pro' || tier === 'enterprise';
  const maxLists = isPro ? Infinity : MAX_FREE_WATCHLISTS;
  const canCreateList = isPro || listCount < MAX_FREE_WATCHLISTS;

  return { canCreateList, listCount, maxLists };
}
