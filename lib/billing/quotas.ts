/**
 * Per-feature quota enforcement for free-tier users.
 *
 * Quotas are checked by counting successful `ai_usage` rows in the current
 * period window. Pro/admin users get `limit: 'unlimited'` unless the feature sets `proCap`.
 *
 * Keep this list narrow — only features with real marginal cost belong here.
 * Per-minute rate limiting is separate (lib/security/rate-limiter.ts).
 */

import { createServerClient } from '@/lib/supabase/client';
import { getTier, isPro } from './tier';

export interface QuotaConfig {
  count: number;
  period: 'day' | 'month';
  /**
   * Optional soft cap for Pro/admin users. When set, Pro is no longer "unlimited" —
   * usage is counted in the same window and blocked past `proCap`. Use only for
   * features with real per-call cost (e.g. Sonnet + extended thinking + web search).
   */
  proCap?: number;
}

/**
 * Free-tier quotas. Pro users bypass these entirely unless `proCap` is set.
 * A count of 0 means "pro-only" (free users blocked immediately).
 */
export const QUOTAS = {
  portfolio_builder: { count: 3,  period: 'month' } as QuotaConfig,
  chat:              { count: 5,  period: 'day', proCap: 150 } as QuotaConfig,  // ~$0.017/message; Pro capped so one heavy user can't cost more than the plan earns
  compare_explain:   { count: 5,  period: 'day'   } as QuotaConfig,
  risk_analysis:     { count: 1,  period: 'month' } as QuotaConfig,
  academy_explain:   { count: 30, period: 'day'   } as QuotaConfig,  // free for all; glossary cache absorbs repeats
  deep_dive:         { count: 1,  period: 'month', proCap: 25 } as QuotaConfig,  // free teaser 1/mo; Pro soft-capped to bound cost
  csv_import:        { count: 5,  period: 'month' } as QuotaConfig,  // AI schema-mapping is a cheap fixed-cost call regardless of file size; free-tier onboarding shouldn't be walled off
  why_today:         { count: 0,  period: 'day'   } as QuotaConfig,  // Pro-only; unlimited for Pro (Sonnet + web search per call)
  // Zero marginal cost (the thesis is already generated for everyone) — this
  // isn't bounding AI spend like the others, it's the free-tier taste of
  // Bull's Weekly Pick. See lib/picks/thesis-access.ts for how "1 free" picks
  // WHICH pick a free user gets to keep reading for the rest of the period.
  weekly_pick_thesis: { count: 1, period: 'month' } as QuotaConfig,
  // "Describe a theme" watchlist fill (lib/watchlist/ai-picks.ts): two Haiku 5.5 calls, ~$0.005. Every run counts, matched or not, reserved atomically (reserveQuota).
  watchlist_ai_fill: { count: 3, period: 'month', proCap: 50 } as QuotaConfig,
};

export type QuotaFeature = keyof typeof QUOTAS;

export interface QuotaState {
  allowed: boolean;
  used: number;
  limit: number | 'unlimited';
  period: 'day' | 'month';
  resetsAt: string;          // ISO timestamp
  reason?: 'free_quota_exceeded' | 'pro_only' | 'pro_cap_reached';
}

/** First moment of the next period (when the quota window rolls over). */
function nextPeriodBoundary(period: 'day' | 'month'): Date {
  const now = new Date();
  if (period === 'day') {
    const next = new Date(now);
    next.setUTCHours(24, 0, 0, 0);  // midnight UTC
    return next;
  }
  // month: 1st of next month UTC
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0));
}

/** First moment of the current period (window start, inclusive). */
export function currentPeriodStart(period: 'day' | 'month'): Date {
  const now = new Date();
  if (period === 'day') {
    const start = new Date(now);
    start.setUTCHours(0, 0, 0, 0);
    return start;
  }
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
}

/**
 * Returns quota state for a feature. Pro users get `limit: 'unlimited'` unless the feature sets `proCap`.
 * Free users get the count + remaining window.
 */
export async function checkQuota(
  userId: string,
  feature: QuotaFeature
): Promise<QuotaState> {
  const config = QUOTAS[feature];
  const tier = await getTier(userId);
  const resetsAt = nextPeriodBoundary(config.period).toISOString();
  const windowStart = currentPeriodStart(config.period).toISOString();

  // Shared helper — count this user's successful calls for the feature in the window
  const countUsed = async (): Promise<number> => {
    const supabase = createServerClient();
    const { count } = await supabase
      .from('ai_usage')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('feature', feature)
      .eq('status', 'success')
      .gte('created_at', windowStart);
    return count ?? 0;
  };

  const pro = isPro(tier);
  // Unlimited Pro never needs the count, so skip the query.
  const used = pro && config.proCap == null ? 0 : await countUsed();
  return { ...quotaDecision(feature, pro, used), used, period: config.period, resetsAt };
}

/**
 * checkQuota and the usage row in one step, for routes that must not let
 * parallel requests through on the same remaining slot. Counts the window and
 * inserts a zero-cost 'success' row under `feature` atomically (migration
 * 200). The caller backfills the real tokens with updateAiCallUsage(id, ...)
 * once the model answers, or calls releaseQuota(id) if no model call happened.
 * The limit comes from quotaDecision, the same rule the client gate uses.
 */
export async function reserveQuota(
  userId: string,
  feature: QuotaFeature,
  model: string,
  metadata?: Record<string, unknown>
): Promise<QuotaState & { reservationId: string | null }> {
  const config = QUOTAS[feature];
  const pro = isPro(await getTier(userId));
  const resetsAt = nextPeriodBoundary(config.period).toISOString();
  const { limit } = quotaDecision(feature, pro, 0);
  if (limit === 0) {
    return { ...quotaDecision(feature, pro, 0), used: 0, period: config.period, resetsAt, reservationId: null };
  }
  const { data, error } = await createServerClient().rpc('reserve_ai_quota', {
    p_user_id: userId,
    p_feature: feature,
    p_model: model,
    p_limit: limit === 'unlimited' ? null : limit,
    p_window_start: currentPeriodStart(config.period).toISOString(),
    p_metadata: metadata ?? null,
  } as never);
  if (error) throw new Error(`reserve_ai_quota failed: ${error.message}`);
  const row = (data as { reservation_id: string | null; used: number }[] | null)?.[0];
  const used = row?.used ?? 0;
  const reservationId = row?.reservation_id ?? null;
  // A granted reservation is one more use; a refused one leaves the count as it was.
  const usedNow = reservationId ? used + 1 : used;
  return {
    ...quotaDecision(feature, pro, used),
    used: usedNow,
    period: config.period,
    resetsAt,
    reservationId,
  };
}

/** Gives back a reservation whose model call never happened. Never throws. */
export async function releaseQuota(reservationId: string): Promise<void> {
  const { error } = await createServerClient().from('ai_usage').delete().eq('id', reservationId);
  if (error) console.error('[quotas] release failed:', error.message);
}

/**
 * The limit rule itself, with no I/O. checkQuota (server) and client gates
 * (BullpenChat's pre-send check) both call it, so the button and the route
 * can't disagree. `used` is the count of successful calls in the window.
 */
export function quotaDecision(
  feature: QuotaFeature,
  pro: boolean,
  used: number
): Pick<QuotaState, 'allowed' | 'limit' | 'reason'> {
  const config = QUOTAS[feature];
  if (pro) {
    // Pro is unlimited unless the feature defines a soft cap to bound cost.
    if (config.proCap == null) return { allowed: true, limit: 'unlimited' };
    return used >= config.proCap
      ? { allowed: false, limit: config.proCap, reason: 'pro_cap_reached' }
      : { allowed: true, limit: config.proCap };
  }
  // Pro-only features (limit 0) bail out with a distinct reason
  if (config.count === 0) return { allowed: false, limit: 0, reason: 'pro_only' };
  return used >= config.count
    ? { allowed: false, limit: config.count, reason: 'free_quota_exceeded' }
    : { allowed: true, limit: config.count };
}
