/**
 * BullPen AI Agent — streaming chat with live database tool access.
 *
 * Tools let the AI query Supabase in real time: company profiles, financial
 * metrics, screening, and side-by-side comparisons. maxSteps enables the
 * model to chain multiple tool calls within a single user turn.
 */

import { streamText, convertToModelMessages } from 'ai';
import { openai } from '@ai-sdk/openai';
import type { UIMessage } from 'ai';
import { SYSTEM_PROMPT } from './systemPrompt';
import { BULLPEN_TOOLS } from './tools';

export async function runAgent(messages: UIMessage[]) {
  const modelMessages = await convertToModelMessages(messages);

  const result = streamText({
    model: openai('gpt-4o'),
    system: SYSTEM_PROMPT,
    messages: modelMessages,
    tools: BULLPEN_TOOLS,
    maxSteps: 5,
    maxTokens: 2048,
  });

  return result;
}
