import { isPro, tierFromInt } from '@/lib/billing/tier';

export const MAX_FREE_WATCHLISTS = 1;

export function canCreateWatchlist(
  currentCount: number,
  accountTier: number | null
): boolean {
  if (isPro(tierFromInt(accountTier))) return true;
  return currentCount < MAX_FREE_WATCHLISTS;
}
