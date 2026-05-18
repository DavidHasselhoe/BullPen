/**
 * AI Chat API — POST handler for BullPen chatbot.
 * Auth + per-user daily quota (15/day free, unlimited Pro). Also rate-limited
 * to 20 req/min as spam protection.
 */

import { NextRequest, NextResponse } from 'next/server';
import { runAgent } from '@/lib/ai/agent';
import { withAuth } from '@/lib/security/api-security';
import { checkRateLimit } from '@/lib/security/rate-limiter';
import { checkQuota } from '@/lib/billing/quotas';
import { logAiCall } from '@/lib/billing/log-ai-call';

async function handler(
  req: NextRequest,
  _ctx: unknown,
  session: { userId: string }
) {
  // Spam protection (per-minute)
  const rl = await checkRateLimit(`ai-chat:${session.userId}`, { windowMs: 60_000, maxRequests: 20 });
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded. Please try again in a minute.' }, { status: 429 });
  }

  // Daily quota (15/day free, unlimited Pro)
  const quota = await checkQuota(session.userId, 'chat');
  if (!quota.allowed) {
    return NextResponse.json({ error: 'quota_exceeded', quota }, { status: 402 });
  }

  const body = await req.json().catch(() => ({}));
  const messages = body?.messages ?? [];
  const context = body?.context ?? null;
  const experienceLevel = (body?.experienceLevel as 'beginner' | 'intermediate' | 'advanced') ?? null;
  const language = (body?.language as string) ?? null;
  const riskProfile = (body?.riskProfile as 'conservative' | 'balanced' | 'aggressive') ?? null;
  const investmentHorizon = (body?.investmentHorizon as 'short' | 'medium' | 'long') ?? null;
  const responseStyle = (body?.responseStyle as 'concise' | 'balanced' | 'detailed') ?? null;

  const result = await runAgent(messages, context, experienceLevel, language, riskProfile, investmentHorizon, responseStyle);

  // Log usage when stream finishes (non-blocking — response streams immediately).
  void result.usage.then((usage) => {
    void logAiCall({
      userId: session.userId,
      feature: 'chat',
      model: 'gpt-4o',
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
    });
  }).catch(() => { /* logging never blocks */ });

  return result.toUIMessageStreamResponse();
}

export const POST = withAuth(handler);
