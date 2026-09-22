/**
 * Per-million-token pricing for the AI models BullPen uses.
 * Used by `lib/billing/log-ai-call.ts` to compute `cost_usd` at call time
 * so we don't have to re-derive it later.
 *
 * Source of truth: provider pricing pages. Update when models change tier.
 */

/**
 * `cacheRead` / `cacheWrite` are Anthropic's prompt-caching rates. Without
 * them a cached call is priced at the full input rate, which overstates chat
 * by roughly 5x now that the 9,200-token prefix is cached on every turn — and
 * the cost dashboard is exactly what someone would use to judge whether that
 * caching was worth enabling. Rates verified 2026-09-22 (5-minute TTL).
 */
export const MODEL_PRICING: Record<
  string,
  { input: number; output: number; cacheRead?: number; cacheWrite?: number }
> = {
  // Anthropic Claude — https://claude.com/pricing
  // Sonnet 5 stayed at $2/$10 past the 2026-08-31 date this row used to warn
  // about; verified against the live pricing page 2026-09-22. Cache reads are
  // $0.20/MTok and writes $2.50/MTok, both priced by calcCost below.
  'claude-sonnet-5':             { input: 2.00,  output: 10.00, cacheRead: 0.20, cacheWrite: 2.50 },
  'claude-sonnet-4-6':           { input: 3.00,  output: 15.00 },
  'claude-sonnet-4-5':           { input: 3.00,  output: 15.00 },
  'claude-opus-4-7':             { input: 15.00, output: 75.00 },
  'claude-haiku-4-5-20251001':   { input: 1.00,  output:  5.00, cacheRead: 0.10, cacheWrite: 1.25 },

  // OpenAI — https://openai.com/api/pricing/
  'gpt-4o':                      { input: 2.50,  output: 10.00 },
  'gpt-4o-mini':                 { input: 0.15,  output:  0.60 },
};

/**
 * Compute cost in USD from token counts.
 *
 * `cache` is the provider's own split of the input tokens. When it is absent
 * every input token is charged at the full rate, which is the pre-caching
 * behaviour and still correct for OpenAI models and uncached calls.
 *
 * Returns 0 for unknown models (rather than throwing) so logging never fails.
 */
export interface CachedTokenSplit {
  noCacheTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

export function calcCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cache?: CachedTokenSplit,
): number {
  const rates = MODEL_PRICING[model];
  if (!rates) return 0;

  const read = cache?.cacheReadTokens ?? 0;
  const write = cache?.cacheWriteTokens ?? 0;
  // Prefer the provider's own uncached count; fall back to subtracting, which
  // also yields the old behaviour when no split was reported at all.
  const full = cache?.noCacheTokens ?? Math.max(0, inputTokens - read - write);

  const inCost =
    (full / 1_000_000) * rates.input +
    (read / 1_000_000) * (rates.cacheRead ?? rates.input) +
    (write / 1_000_000) * (rates.cacheWrite ?? rates.input);
  const outCost = (outputTokens / 1_000_000) * rates.output;
  return Number((inCost + outCost).toFixed(6));
}

