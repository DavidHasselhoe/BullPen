/**
 * BullPen AI Agent — streaming chat with live database tool access.
 *
 * Tools let the AI query Supabase in real time: company profiles, financial
 * metrics, screening, and side-by-side comparisons. maxSteps enables the
 * model to chain multiple tool calls within a single user turn.
 */

import { streamText, convertToModelMessages, stepCountIs } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import type { UIMessage } from 'ai';
import { SYSTEM_PROMPT } from './systemPrompt';
import { BULLPEN_TOOLS, createAlertTool, getPortfolioContextTool, getInsiderActivityTool } from './tools';
import { languageName } from '@/lib/i18n/language-names';
import { assertNoMutatingToolsWithExternalContent } from './tool-boundary';

interface AIContext {
  tickers: string[];
  label?: string;
}

export async function runAgent(
  messages: UIMessage[],
  context?: AIContext | null,
  experienceLevel?: 'beginner' | 'intermediate' | 'advanced' | null,
  language?: string | null,
  riskProfile?: 'conservative' | 'balanced' | 'aggressive' | null,
  investmentHorizon?: 'short' | 'medium' | 'long' | null,
  responseStyle?: 'concise' | 'balanced' | 'detailed' | null,
  userId?: string | null,
  allowHoldingsContext?: boolean | null,
  abortSignal?: AbortSignal,
) {
  const modelMessages = await convertToModelMessages(messages);

  const languagePrefix = language && language !== 'en'
    ? `[Language: You MUST respond entirely in ${languageName(language)}. Do not switch to English under any circumstance.]\n\n`
    : '';

  // Prepend experience level so the model adapts its tone and vocabulary.
  const experiencePrefix = experienceLevel === 'beginner'
    ? `[User level: BEGINNER. Use plain everyday language. Avoid jargon — if you must use a financial term, define it immediately in parentheses. Short sentences. Explain like teaching a curious 16-year-old, not a Wall Street analyst.]\n\n`
    : experienceLevel === 'advanced'
    ? `[User level: ADVANCED. Use precise financial terminology freely. Skip basic definitions. Assume the user understands GAAP, DCF, multiple expansion, etc. Prioritise density and insight.]\n\n`
    : '';

  const riskPrefix = riskProfile === 'conservative'
    ? `[User risk profile: CONSERVATIVE. Frame analysis with capital preservation in mind. Highlight downside risks, protective factors, and margin of safety. Flag leverage and liquidity risks prominently.]\n\n`
    : riskProfile === 'aggressive'
    ? `[User risk profile: AGGRESSIVE. The user is comfortable with higher risk in pursuit of higher returns. Lead with upside potential, growth catalysts, and total addressable market. Note associated risks but don't dwell on them.]\n\n`
    : riskProfile === 'balanced'
    ? `[User risk profile: BALANCED. Present a balanced risk-reward view. Discuss both upside potential and downside scenarios with equal weight.]\n\n`
    : '';

  const horizonPrefix = investmentHorizon === 'short'
    ? `[User investment horizon: SHORT-TERM (< 1 year). Prioritize near-term catalysts, earnings momentum, and macro/sector rotation. De-emphasize long-term fundamentals.]\n\n`
    : investmentHorizon === 'long'
    ? `[User investment horizon: LONG-TERM (5+ years). Focus on durable competitive advantages, compounding earnings power, balance sheet quality, and management track record. De-emphasize short-term price fluctuations.]\n\n`
    : investmentHorizon === 'medium'
    ? `[User investment horizon: MEDIUM-TERM (1–5 years). Balance near-term catalysts with fundamental quality. Consider both current valuation and 2–3 year earnings trajectory.]\n\n`
    : '';

  const stylePrefix = responseStyle === 'concise'
    ? `[Response style: CONCISE. Limit responses to 1–2 short paragraphs or a tight bullet list. Omit explanatory background unless directly asked. Prioritize the key insight and one actionable takeaway.]\n\n`
    : responseStyle === 'detailed'
    ? `[Response style: DETAILED. Provide comprehensive analysis with all relevant sections: summary, key figures, trend analysis, risks, and takeaway. Do not truncate.]\n\n`
    : '';

  // Prepend a context block when the user is viewing a specific stock/comparison page.
  const contextLabel = context?.label ?? context?.tickers?.join(', ') ?? '';
  const contextPrefix = context?.tickers?.length
    ? `[Current page context: The user is viewing "${contextLabel}" (${context.tickers.join(', ')}). Unless the user specifies a different company, answer questions about ${context.tickers.join(' and ')} first.]\n\n`
    : '';

  // createAlert needs userId to check the free-tier alert limit server-side —
  // it's built per-request rather than living in the static BULLPEN_TOOLS map.
  // Omitted entirely when userId is unavailable so the model never sees it.
  // getPortfolioContext is opt-in (Settings > Ask Bull) — omitted unless the
  // user has explicitly allowed Bull to read their holdings/watchlist.
  const tools = {
    ...BULLPEN_TOOLS,
    ...(userId ? { createAlert: createAlertTool(userId) } : {}),
    ...(userId && allowHoldingsContext ? { getPortfolioContext: getPortfolioContextTool(userId) } : {}),
    // Pro-gated (see /api/stock/[ticker]/insider-transactions) — needs userId
    // to check tier server-side, so it can't live in the static tool map.
    ...(userId ? { getInsiderActivity: getInsiderActivityTool(userId) } : {}),
  };
  assertNoMutatingToolsWithExternalContent(Object.keys(tools));

  /**
   * Everything that varies per request, kept OUT of the cached prefix.
   *
   * These used to be concatenated in front of SYSTEM_PROMPT. Prompt caching is
   * a prefix match, so a per-user string at the front invalidates everything
   * behind it and the hit rate would have been zero. They sit after the
   * breakpoint now, which also means the specific instruction is the last
   * thing the model reads.
   */
  // Without a date the model assumes it lives at its training cutoff and
  // "corrects" live quotes against stale memory (called MU at $1,056 a glitch).
  const datePrefix = `[Today's date: ${new Date().toISOString().slice(0, 10)}]\n\n`;
  const perRequestPrefix =
    datePrefix + languagePrefix + experiencePrefix + riskPrefix + horizonPrefix + stylePrefix + contextPrefix;

  const result = streamText({
    model: anthropic('claude-sonnet-5'),
    /**
     * The system prompt is a system *message* rather than the `system` option
     * so it can carry a cache breakpoint.
     *
     * Anthropic renders tools -> system -> messages, so this single breakpoint
     * covers the tool schemas as well as the prompt. Measured live
     * (scripts/test-chat-provider.ts, 2026-09-22): 18,732 cached tokens, of
     * which the prompt is 9,022 and the 23 tool schemas are the other ~9,700.
     * A warm turn costs $0.0045 against $0.038 for the same turn uncached.
     *
     * Note the shape of that: a cold turn writes the prefix at 1.25x, so it
     * costs $0.047, MORE than not caching. Caching wins from the second turn
     * of a conversation onwards, which is the normal case for a chat but not
     * for a one-shot question. The tool schemas being half the payload is the
     * next thing worth attacking; ten of the 23 tools are navigation.
     *
     * The cached prefix is only stable while the tool set is. `tools` above is
     * built by spreading a static object literal, so its order is fixed, but
     * the three conditional tools mean logged-out, logged-in, and
     * holdings-enabled callers each get their own cache entry. That is fine;
     * each cohort is stable within itself.
     */
    messages: [
      {
        role: 'system' as const,
        content: SYSTEM_PROMPT,
        providerOptions: { anthropic: { cacheControl: { type: 'ephemeral' } } },
      },
      ...(perRequestPrefix
        ? [{ role: 'system' as const, content: perRequestPrefix }]
        : []),
      ...modelMessages,
    ],
    tools,
    /**
     * Automatic caching for the growing tail, alongside the explicit
     * breakpoint above. The documented pairing for an agent loop: the explicit
     * marker guarantees a read point for the static prefix, and this one moves
     * forward as the conversation and the tool results accumulate.
     *
     * What this is and is not worth, measured rather than assumed. A two-step
     * tool turn that then ends is about 3% WORSE with it: step 2 wrote 578
     * tokens at the 1.25x write rate that nothing ever read back. Two thirds
     * of conversations in ai_conversations are a single exchange, so that is
     * the common case.
     *
     * It earns its place at the other end of the distribution. Without it,
     * every turn re-sends the whole accumulated history at full rate, so a
     * long conversation's cost grows quadratically; there are 15- and
     * 23-message conversations on record. With it, each turn reads what the
     * last one wrote and the growth is linear. Net across the real
     * distribution is about +$0.0012 a conversation: not much, but it removes
     * a scaling cliff rather than shaving a constant.
     */
    providerOptions: { anthropic: { cacheControl: { type: 'ephemeral' } } },
    // Was `maxTokens` — not a real field on this SDK version (silently
    // dropped, so this cap was never actually enforced). The correct name is
    // maxOutputTokens.
    maxOutputTokens: 2048,
    // Allow up to 5 steps so the model can call tools, receive results, and generate text.
    // Default stopWhen: stepCountIs(1) stops after the first turn (tool calls) before the model
    // gets a second turn to incorporate tool results into its response.
    stopWhen: stepCountIs(5),
    // Kept from the OpenAI era, where a 30k-per-minute org ceiling made 429s
    // routine. Anthropic allows 10M input tokens a minute on this account, so
    // these retries are now for genuine transient failures rather than a
    // ceiling we were living against. See docs/ai-chat-provider-migration.md.
    maxRetries: 3,
    // Without this, a client-side cancellation (the user sends a new message,
    // navigates away, or closes the panel while a reply is still streaming)
    // never reached the provider — the route handler's request signal was never
    // threaded through, so every in-flight step (and any of its retries) ran
    // to completion and was billed regardless of whether anyone was still
    // waiting on it. Each step here resends the full system prompt + every
    // tool schema (~10k+ tokens before any real content), so an abandoned
    // request that keeps stepping/retrying is expensive, not just wasted.
    abortSignal,
  });

  return result;
}
