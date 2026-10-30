import { isPro, tierFromUser } from '@/lib/billing/tier';
import { FREE_WATCHLISTS } from '@/lib/billing/entitlements';

export const MAX_FREE_WATCHLISTS = FREE_WATCHLISTS;

/** Same inputs as tierFromUser, so the server agrees with useWatchlistLimits (admins included). */
export function canCreateWatchlist(
  currentCount: number,
  accountTier: number | null,
  role: string | null,
  proBonusUntil?: string | null
): boolean {
  if (isPro(tierFromUser(accountTier, role, proBonusUntil))) return true;
  return currentCount < MAX_FREE_WATCHLISTS;
}
