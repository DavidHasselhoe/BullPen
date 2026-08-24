/**
 * Tier representation — single source of truth.
 *
 * DB schema (migration 026 + 057):
 *   users.account_tier  INTEGER     — billing tier: 1 = free, 3 = paid Pro
 *   users.role          TEXT        — privilege role: 'user' | 'admin' (CHECK constraint)
 *
 * Admin is orthogonal to billing: an admin always has Pro-level access AND can
 * view the admin dashboard, regardless of `account_tier`. Promotion to admin is
 * intentional only — set via SQL, not from any UI flow.
 *
 * Use this module everywhere instead of comparing raw integers or strings.
 */

import { createServerClient } from '@/lib/supabase/client';

export type Tier = 'free' | 'pro' | 'admin';

/**
 * Derive the unified Tier from the raw DB fields. `role='admin'` wins regardless
 * of billing tier; otherwise tier comes from `account_tier`, OR a still-active
 * `pro_bonus_until` (referral rewards — see migration 114/115, lib/auth/
 * share-attribution.ts). The bonus is deliberately independent of
 * `account_tier`: it's never touched by the Stripe webhook, so it can't be
 * silently stomped by a billing event, and it still applies on top of a real
 * Free account with no Stripe subscription at all.
 */
export function tierFromUser(
  accountTier: number | null | undefined,
  role: string | null | undefined,
  proBonusUntil?: string | null
): Tier {
  if (role === 'admin') return 'admin';
  if (typeof accountTier === 'number' && accountTier >= 3) return 'pro';
  if (proBonusUntil && new Date(proBonusUntil).getTime() > Date.now()) return 'pro';
  return 'free';
}

/** True for paid Pro AND admin (admins should always have feature access). */
export function isPro(t: Tier | null | undefined): boolean {
  return t === 'pro' || t === 'admin';
}

/**
 * Display label for a raw account_tier as shown to OTHER users (Browse
 * Members, public profiles, Academy leaderboard) — role isn't available on
 * those public-facing queries (deliberately excluded, see
 * app/api/users/search/route.ts), so this only has account_tier to work
 * with. Migration 026 retired the old 'free'/'premium'/'enterprise' text
 * tiers in favor of an integer scale where 1-2 are both free and only 3 is
 * paid — this app calls that paid tier "Pro", never "Enterprise".
 */
export function tierLabel(accountTier: number | null | undefined): 'Member' | 'Pro' | null {
  if (accountTier == null) return null;
  return accountTier >= 3 ? 'Pro' : 'Member';
}

/** True only for admin — for routes/UI that should be invisible to paying users. */
export function isAdmin(t: Tier | null | undefined): boolean {
  return t === 'admin';
}

/** Server-side: look up the user's tier by ID. Falls back to 'free' on any error. */
export async function getTier(userId: string): Promise<Tier> {
  try {
    const supabase = createServerClient();
    const { data } = await supabase
      .from('users')
      .select('account_tier, role, pro_bonus_until')
      .eq('id', userId)
      .maybeSingle();
    return tierFromUser(
      (data?.account_tier as number | null) ?? null,
      (data?.role as string | null) ?? null,
      (data as { pro_bonus_until?: string | null } | null)?.pro_bonus_until ?? null
    );
  } catch {
    return 'free';
  }
}
