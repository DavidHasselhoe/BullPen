/**
 * Tier representation — single source of truth.
 *
 * The DB stores `users.account_tier` as INTEGER (migration 026):
 *   1 = free
 *   2 = admin/staff (internal — full access without paying)
 *   3 = paid Pro
 *
 * Use this module everywhere instead of comparing raw integers or strings.
 * Historical code did `account_tier === 'free'` which silently failed against
 * the INT column — `isPro()` and `tierFromInt()` exist to prevent that class of bug.
 */

import { createServerClient } from '@/lib/supabase/client';

export type Tier = 'free' | 'pro' | 'admin';

export function tierFromInt(n: number | null | undefined): Tier {
  if (typeof n !== 'number') return 'free';
  if (n >= 3) return 'pro';
  if (n >= 2) return 'admin';
  return 'free';
}

/** True for paid Pro AND staff/admin (admins should always have feature access). */
export function isPro(t: Tier | null | undefined): boolean {
  return t === 'pro' || t === 'admin';
}

/** True only for admin/staff — for routes that should NOT be accessible by paying users. */
export function isAdmin(t: Tier | null | undefined): boolean {
  return t === 'admin';
}

/** Server-side: look up the user's tier by ID. Falls back to 'free' on any error. */
export async function getTier(userId: string): Promise<Tier> {
  try {
    const supabase = createServerClient();
    const { data } = await supabase
      .from('users')
      .select('account_tier')
      .eq('id', userId)
      .maybeSingle();
    return tierFromInt((data?.account_tier as number | null) ?? null);
  } catch {
    return 'free';
  }
}
