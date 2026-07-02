'use client';

import { useMemo } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { tierFromUser } from '@/lib/billing/tier';
import { entitlementsFor, type Entitlements } from '@/lib/billing/entitlements';

/**
 * Client-side plan/entitlements for the signed-in user. Reads `account_tier` +
 * `role` (both already on AuthUser) → unified tier → resolved limits/flags.
 * Server routes still enforce authoritatively via `getTier()` + `checkQuota()`.
 */
export function useEntitlements(): Entitlements {
  const { user } = useAuth();
  return useMemo(
    () => entitlementsFor(tierFromUser(user?.account_tier, user?.role)),
    [user?.account_tier, user?.role]
  );
}
