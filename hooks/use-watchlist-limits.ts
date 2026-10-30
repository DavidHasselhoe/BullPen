'use client';

import { useAuth } from '@/hooks/use-auth';
import { useWatchlistLists } from '@/hooks/use-watchlist';
import { MAX_FREE_WATCHLISTS, canCreateWatchlist } from '@/lib/watchlist/limits';
import { isPro, tierFromUser } from '@/lib/billing/tier';

export function useWatchlistLimits() {
  const { user } = useAuth();
  const { data: lists } = useWatchlistLists();

  const listCount = lists?.length ?? 0;
  const userIsPro = isPro(tierFromUser(user?.account_tier ?? null, user?.role ?? null, user?.pro_bonus_until ?? null));
  const maxLists = userIsPro ? Infinity : MAX_FREE_WATCHLISTS;
  // The server's POST /api/watchlist/lists gate, so the dialog never opens for a create the API will refuse.
  const canCreateList = canCreateWatchlist(listCount, user?.account_tier ?? null, user?.role ?? null, user?.pro_bonus_until ?? null);

  return { canCreateList, listCount, maxLists };
}
