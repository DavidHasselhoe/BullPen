/**
 * BullPen AI Agent — streaming chat with LLM
 * Tool-ready: add tools to the streamText call when needed
 */

import { streamText, convertToModelMessages } from 'ai';
import { openai } from '@ai-sdk/openai';
import type { UIMessage } from 'ai';
import { SYSTEM_PROMPT } from './systemPrompt';

export async function runAgent(messages: UIMessage[]) {
  const modelMessages = await convertToModelMessages(messages);

  const result = streamText({
    model: openai('gpt-4o'),
    system: SYSTEM_PROMPT,
    messages: modelMessages,
    maxTokens: 2048,
  });

  return result;
}
