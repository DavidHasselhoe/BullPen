/**
 * AI Chat API — POST handler for BullPen chatbot
 * Rate limited to prevent abuse (20 requests per minute).
 */

import { NextRequest } from 'next/server';
import { runAgent } from '@/lib/ai/agent';
import { withRateLimit } from '@/lib/security/api-security';

async function handler(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const messages = body?.messages ?? [];
  const context = body?.context ?? null;
  const experienceLevel = (body?.experienceLevel as 'beginner' | 'intermediate' | 'advanced') ?? null;
  const language = (body?.language as string) ?? null;

  const result = await runAgent(messages, context, experienceLevel, language);
  return result.toUIMessageStreamResponse();
}

export const POST = withRateLimit(handler, { windowMs: 60 * 1000, maxRequests: 20 });
