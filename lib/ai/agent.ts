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

interface AIContext {
  tickers: string[];
  label?: string;
}

export async function runAgent(messages: UIMessage[], context?: AIContext | null) {
  const modelMessages = await convertToModelMessages(messages);

  // Prepend a context block when the user is viewing a specific stock/comparison page.
  // This tells the model what the user is currently looking at without modifying SYSTEM_PROMPT.
  const contextLabel = context?.label ?? context?.tickers?.join(', ') ?? '';
  const contextPrefix = context?.tickers?.length
    ? `[Current page context: The user is viewing "${contextLabel}" (${context.tickers.join(', ')}). Unless the user specifies a different company, answer questions about ${context.tickers.join(' and ')} first.]\n\n`
    : '';

  const result = streamText({
    model: openai('gpt-4o'),
    system: contextPrefix + SYSTEM_PROMPT,
    messages: modelMessages,
    tools: BULLPEN_TOOLS,
    maxSteps: 5,
    maxTokens: 2048,
    // Allow up to 5 steps so the model can call tools, receive results, and generate text.
    // Default stopWhen: stepCountIs(1) stops after the first turn (tool calls) before the model
    // gets a second turn to incorporate tool results into its response.
    stopWhen: stepCountIs(5),
  });

  return result;
}
