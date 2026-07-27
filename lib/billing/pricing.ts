/**
 * Per-million-token pricing for the AI models BullPen uses.
 * Used by `lib/billing/log-ai-call.ts` to compute `cost_usd` at call time
 * so we don't have to re-derive it later.
 *
 * Source of truth: provider pricing pages. Update when models change tier.
 */

export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // Anthropic Claude — https://www.anthropic.com/pricing
  // claude-sonnet-5 intro pricing ($2/$10) runs through 2026-08-31, then $3/$15 — update this row after that date.
  'claude-sonnet-5':             { input: 2.00,  output: 10.00 },
  'claude-sonnet-4-6':           { input: 3.00,  output: 15.00 },
  'claude-sonnet-4-5':           { input: 3.00,  output: 15.00 },
  'claude-opus-4-7':             { input: 15.00, output: 75.00 },
  'claude-haiku-4-5-20251001':   { input: 1.00,  output:  5.00 },

  // OpenAI — https://openai.com/api/pricing/
  'gpt-4o':                      { input: 2.50,  output: 10.00 },
  'gpt-4o-mini':                 { input: 0.15,  output:  0.60 },
};

/**
 * Compute cost in USD from token counts.
 * Returns 0 for unknown models (rather than throwing) so logging never fails.
 */
export function calcCost(model: string, inputTokens: number, outputTokens: number): number {
  const rates = MODEL_PRICING[model];
  if (!rates) return 0;
  const inCost  = (inputTokens  / 1_000_000) * rates.input;
  const outCost = (outputTokens / 1_000_000) * rates.output;
  return Number((inCost + outCost).toFixed(6));
}
