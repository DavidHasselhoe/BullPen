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
 * of billing tier; otherwise tier comes from `account_tier`.
 */
export function tierFromUser(
  accountTier: number | null | undefined,
  role: string | null | undefined
): Tier {
  if (role === 'admin') return 'admin';
  if (typeof accountTier === 'number' && accountTier >= 3) return 'pro';
  return 'free';
}

/**
 * Back-compat: when only account_tier is available (e.g. older code paths that
 * haven't been migrated). Prefer `tierFromUser` since it also considers role.
 */
export function tierFromInt(n: number | null | undefined): Tier {
  return tierFromUser(n, null);
}

/** True for paid Pro AND admin (admins should always have feature access). */
export function isPro(t: Tier | null | undefined): boolean {
  return t === 'pro' || t === 'admin';
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
      .select('account_tier, role')
      .eq('id', userId)
      .maybeSingle();
    return tierFromUser(
      (data?.account_tier as number | null) ?? null,
      (data?.role as string | null) ?? null
    );
  } catch {
    return 'free';
  }
}
