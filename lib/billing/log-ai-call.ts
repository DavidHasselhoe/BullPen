/**
 * Logs a single AI call (Anthropic, OpenAI) to the `ai_usage` table.
 *
 * Two uses:
 *  1. Feed the quota system (lib/billing/quotas.ts counts rows here)
 *  2. Power the admin cost dashboard (/admin/costs)
 *
 * MUST NEVER THROW. The caller should `void logAiCall(...)` and continue —
 * a logging failure must not break a user-facing AI response.
 */

import { createServerClient } from '@/lib/supabase/client';
import { calcCost } from './pricing';

export interface LogAiCallParams {
  userId: string | null;          // null for cron jobs (e.g. daily brief)
  feature: string;                 // 'portfolio_builder' | 'chat' | 'why_today' | 'compare_explain' | 'risk_analysis' | 'competitors' | 'daily_brief'
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  status?: 'success' | 'error' | 'blocked';
  metadata?: Record<string, unknown>;
}

export async function logAiCall(params: LogAiCallParams): Promise<void> {
  try {
    const inputTokens  = params.inputTokens  ?? 0;
    const outputTokens = params.outputTokens ?? 0;
    const costUsd      = calcCost(params.model, inputTokens, outputTokens);

    const supabase = createServerClient();
    await supabase.from('ai_usage').insert({
      user_id:       params.userId,
      feature:       params.feature,
      model:         params.model,
      input_tokens:  inputTokens || null,
      output_tokens: outputTokens || null,
      cost_usd:      costUsd,
      status:        params.status ?? 'success',
      metadata:      params.metadata ?? null,
    });
  } catch (err) {
    // Logging never fails the caller. Surface in dev so we notice config drift.
    if (process.env.NODE_ENV === 'development') {
      console.error('[ai-usage] log failed:', err);
    }
  }
}
