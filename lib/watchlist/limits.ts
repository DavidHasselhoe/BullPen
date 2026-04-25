export const MAX_FREE_WATCHLISTS = 1;

export function canCreateWatchlist(
  currentCount: number,
  accountTier: 'free' | 'pro' | 'enterprise' | null
): boolean {
  if (accountTier === 'pro' || accountTier === 'enterprise') return true;
  return currentCount < MAX_FREE_WATCHLISTS;
}
