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

/** Returns the inserted row's id (or null on failure) so a caller that logs
 *  before knowing real token counts (see logAiCallPending) can update it later. */
export async function logAiCall(params: LogAiCallParams): Promise<string | null> {
  try {
    const inputTokens  = params.inputTokens  ?? 0;
    const outputTokens = params.outputTokens ?? 0;
    const costUsd      = calcCost(params.model, inputTokens, outputTokens);

    const supabase = createServerClient();
    const { data } = await supabase.from('ai_usage').insert({
      user_id:       params.userId,
      feature:       params.feature,
      model:         params.model,
      input_tokens:  inputTokens || null,
      output_tokens: outputTokens || null,
      cost_usd:      costUsd,
      status:        params.status ?? 'success',
      metadata:      params.metadata ?? null,
    }).select('id').single();
    return (data as { id: string } | null)?.id ?? null;
  } catch (err) {
    // Logging never fails the caller. Surface in dev so we notice config drift.
    if (process.env.NODE_ENV === 'development') {
      console.error('[ai-usage] log failed:', err);
    }
    return null;
  }
}

/**
 * Logs a call as 'success' with zero token counts BEFORE the real usage is
 * known — for streaming features (chat, chart) where checkQuota only counts
 * status='success' rows and the normal post-completion logAiCall() never
 * runs if the client aborts the connection before the stream finishes.
 * Without this, a script could repeat "send message, immediately disconnect"
 * to use the feature far past its daily quota, since nothing ever gets
 * counted. Call this right after the model request is dispatched (not
 * before the quota/rate-limit checks), then backfill real token counts via
 * updateAiCallUsage once they're known.
 */
export async function logAiCallPending(params: Omit<LogAiCallParams, 'status'>): Promise<string | null> {
  return logAiCall({ ...params, status: 'success' });
}

/** Backfills real token counts + cost on a row created by logAiCallPending. */
export async function updateAiCallUsage(
  id: string,
  model: string,
  inputTokens: number | undefined,
  outputTokens: number | undefined
): Promise<void> {
  try {
    const supabase = createServerClient();
    await supabase.from('ai_usage').update({
      input_tokens:  inputTokens ?? null,
      output_tokens: outputTokens ?? null,
      cost_usd:      calcCost(model, inputTokens ?? 0, outputTokens ?? 0),
    } as never).eq('id', id);
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[ai-usage] usage backfill failed:', err);
    }
  }
}
