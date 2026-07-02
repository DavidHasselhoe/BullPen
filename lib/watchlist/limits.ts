import { isPro, tierFromInt } from '@/lib/billing/tier';
import { FREE_WATCHLISTS } from '@/lib/billing/entitlements';

export const MAX_FREE_WATCHLISTS = FREE_WATCHLISTS;

export function canCreateWatchlist(
  currentCount: number,
  accountTier: number | null
): boolean {
  if (isPro(tierFromInt(accountTier))) return true;
  return currentCount < MAX_FREE_WATCHLISTS;
}
