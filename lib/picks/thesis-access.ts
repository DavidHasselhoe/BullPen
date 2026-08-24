/**
 * Free-tier access to a pick's thesis: signed-in free users get to keep
 * reading ONE pick's full thesis per calendar month (their choice — whichever
 * they open first that period), the same "free teaser" shape as Deep Dive's
 * 1/month. Pro is unlimited. Anonymous visitors get the summary only — the
 * ticker, entry, and full track record, never the thesis (see picks-db.ts's
 * header comment on why those stay free regardless).
 *
 * Costs nothing extra to grant: the thesis was already generated once for
 * everyone, so this isn't bounding AI spend like the other quotas — it's
 * genuinely just an access flag, logged through the same ai_usage/checkQuota
 * machinery for consistency (and so /admin/costs sees it, at $0).
 */

import { createServerClient } from '@/lib/supabase/client';
import { getTier, isPro, type Tier } from '@/lib/billing/tier';
import { currentPeriodStart, checkQuota } from '@/lib/billing/quotas';
import { logAiCall } from '@/lib/billing/log-ai-call';

export interface ThesisAccess {
  tier: Tier;
  unlocked: boolean;
  /** Why `unlocked` is false — absent when unlocked is true. Drives the upsell copy. */
  lockReason?: 'anonymous' | 'free_quota_used';
}

/**
 * Resolves whether `session` may see `pickDate`'s thesis right now. Grants
 * (and records) the free monthly slot on first use if the caller is eligible
 * and hasn't spent it yet this period — a no-op read otherwise.
 */
export async function resolveThesisAccess(
  session: { userId: string } | null,
  pickDate: string,
  model: string
): Promise<ThesisAccess> {
  if (!session) return { tier: 'free', unlocked: false, lockReason: 'anonymous' };

  const tier = await getTier(session.userId);
  if (isPro(tier)) return { tier, unlocked: true };

  const supabase = createServerClient();
  const windowStart = currentPeriodStart('month').toISOString();

  const { data } = await supabase
    .from('ai_usage')
    .select('metadata')
    .eq('user_id', session.userId)
    .eq('feature', 'weekly_pick_thesis')
    .eq('status', 'success')
    .gte('created_at', windowStart)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const redeemedDate = (data as { metadata: { pickDate?: string } | null } | null)?.metadata?.pickDate;
  if (redeemedDate === pickDate) return { tier, unlocked: true };
  if (redeemedDate) return { tier, unlocked: false, lockReason: 'free_quota_used' };

  // Not redeemed yet this period — confirm against checkQuota (belt and
  // suspenders, keeps the two count sources from ever disagreeing) and grant.
  const quota = await checkQuota(session.userId, 'weekly_pick_thesis');
  if (!quota.allowed) return { tier, unlocked: false, lockReason: 'free_quota_used' };

  void logAiCall({
    userId: session.userId,
    feature: 'weekly_pick_thesis',
    model,
    metadata: { pickDate },
  });

  return { tier, unlocked: true };
}
