/**
 * BullPen AI Agent — streaming chat with live database tool access.
 *
 * Tools let the AI query Supabase in real time: company profiles, financial
 * metrics, screening, and side-by-side comparisons. maxSteps enables the
 * model to chain multiple tool calls within a single user turn.
 */

import { streamText, convertToModelMessages, stepCountIs } from 'ai';
import { openai } from '@ai-sdk/openai';
import type { UIMessage } from 'ai';
import { SYSTEM_PROMPT } from './systemPrompt';
import { BULLPEN_TOOLS } from './tools';
import { languageName } from '@/lib/i18n/language-names';

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

  const result = streamText({
    model: openai('gpt-4o'),
    system: languagePrefix + experiencePrefix + riskPrefix + horizonPrefix + stylePrefix + contextPrefix + SYSTEM_PROMPT,
    messages: modelMessages,
    tools: BULLPEN_TOOLS,
    maxSteps: 5,
    maxTokens: 2048,
    // Allow up to 5 steps so the model can call tools, receive results, and generate text.
    // Default stopWhen: stepCountIs(1) stops after the first turn (tool calls) before the model
    // gets a second turn to incorporate tool results into its response.
    stopWhen: stepCountIs(5),
    // OpenAI 429s (tokens-per-minute) are marked isRetryable by the SDK and
    // typically clear within a few seconds as the rolling per-minute window
    // advances — a couple of extra retries with backoff meaningfully cuts how
    // often a transient org-wide TPM spike reaches the user as a hard error.
    maxRetries: 3,
  });

  return result;
}
