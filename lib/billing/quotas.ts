/**
 * Per-feature quota enforcement for free-tier users.
 *
 * Quotas are checked by counting successful `ai_usage` rows in the current
 * period window. Pro/admin users always have `allowed: true` with `limit: 'unlimited'`.
 *
 * Keep this list narrow — only features with real marginal cost belong here.
 * Per-minute rate limiting is separate (lib/security/rate-limiter.ts).
 */

import { createServerClient } from '@/lib/supabase/client';
import { getTier, isPro } from './tier';

export interface QuotaConfig {
  count: number;
  period: 'day' | 'month';
}

/**
 * Free-tier quotas. Pro users bypass these entirely.
 * A count of 0 means "pro-only" (free users blocked immediately).
 */
export const QUOTAS = {
  portfolio_builder: { count: 3,  period: 'month' } as QuotaConfig,
  chat:              { count: 15, period: 'day'   } as QuotaConfig,
  why_today:         { count: 0,  period: 'day'   } as QuotaConfig,  // pro-only
  compare_explain:   { count: 5,  period: 'day'   } as QuotaConfig,
  risk_analysis:     { count: 1,  period: 'month' } as QuotaConfig,
};

export type QuotaFeature = keyof typeof QUOTAS;

export interface QuotaState {
  allowed: boolean;
  used: number;
  limit: number | 'unlimited';
  period: 'day' | 'month';
  resetsAt: string;          // ISO timestamp
  reason?: 'free_quota_exceeded' | 'pro_only';
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
function currentPeriodStart(period: 'day' | 'month'): Date {
  const now = new Date();
  if (period === 'day') {
    const start = new Date(now);
    start.setUTCHours(0, 0, 0, 0);
    return start;
  }
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
}

/**
 * Returns quota state for a feature. Pro users always get `allowed: true, limit: 'unlimited'`.
 * Free users get the count + remaining window.
 */
export async function checkQuota(
  userId: string,
  feature: QuotaFeature
): Promise<QuotaState> {
  const config = QUOTAS[feature];
  const tier = await getTier(userId);
  const resetsAt = nextPeriodBoundary(config.period).toISOString();

  if (isPro(tier)) {
    return {
      allowed: true,
      used: 0,
      limit: 'unlimited',
      period: config.period,
      resetsAt,
    };
  }

  // Free users: count successful calls in the current window
  const windowStart = currentPeriodStart(config.period).toISOString();
  const supabase = createServerClient();
  const { count } = await supabase
    .from('ai_usage')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('feature', feature)
    .eq('status', 'success')
    .gte('created_at', windowStart);

  const used = count ?? 0;

  // Pro-only features (limit 0) bail out with a distinct reason
  if (config.count === 0) {
    return {
      allowed: false,
      used,
      limit: 0,
      period: config.period,
      resetsAt,
      reason: 'pro_only',
    };
  }

  if (used >= config.count) {
    return {
      allowed: false,
      used,
      limit: config.count,
      period: config.period,
      resetsAt,
      reason: 'free_quota_exceeded',
    };
  }

  return {
    allowed: true,
    used,
    limit: config.count,
    period: config.period,
    resetsAt,
  };
}
