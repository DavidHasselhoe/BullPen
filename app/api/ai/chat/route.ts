/**
 * AI Chat API — POST handler for BullPen chatbot
 */

import { runAgent } from '@/lib/ai/agent';

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = await runAgent(messages ?? []);

  return result.toUIMessageStreamResponse();
}
