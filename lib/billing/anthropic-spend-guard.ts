/**
 * Circuit breaker for unattended (cron/script) Anthropic-calling features.
 *
 * Interactive, user-facing AI features (chat, why-today, deep-dive) are
 * already bounded by lib/billing/quotas.ts — a human has to keep clicking.
 * Cron/script features have no such backpressure: a bug or a burst of manual
 * test runs during development can fire the same expensive call repeatedly
 * with nothing to stop it. That's exactly what happened 2026-08-13 — the
 * Instagram earnings web-search feature was manually re-run 5-6 times while
 * being built, at $0.19-0.69/run (far above the "low-single-digit cents"
 * the code assumed), and drained the account's Anthropic credit balance,
 * breaking the next morning's daily-brief cron with no warning.
 *
 * Call this before any unattended Anthropic call that isn't already gated
 * by a per-user quota. Fails open (allows the call) if the check itself
 * errors — a logging outage should never be the thing that breaks the cron.
 */

import { createServerClient } from '@/lib/supabase/client';

const DEFAULT_DAILY_CAP_USD = 5;

export interface SpendGuardResult {
  allowed: boolean;
  spentTodayUsd: number;
  capUsd: number;
}

export async function checkAnthropicDailySpend(): Promise<SpendGuardResult> {
  const capUsd = Number(process.env.ANTHROPIC_DAILY_SPEND_CAP_USD) || DEFAULT_DAILY_CAP_USD;

  try {
    const todayStartUtc = new Date();
    todayStartUtc.setUTCHours(0, 0, 0, 0);

    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('ai_usage')
      .select('cost_usd')
      .ilike('model', 'claude-%')
      .gte('created_at', todayStartUtc.toISOString());

    if (error) throw new Error(error.message);

    const spentTodayUsd = (data ?? []).reduce((sum, row) => sum + Number(row.cost_usd ?? 0), 0);
    return { allowed: spentTodayUsd < capUsd, spentTodayUsd, capUsd };
  } catch (err) {
    console.error('[anthropic-spend-guard] check failed, failing open:', err);
    return { allowed: true, spentTodayUsd: 0, capUsd };
  }
}
