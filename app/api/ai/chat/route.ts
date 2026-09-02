/**
 * AI Chat API — POST handler for BullPen chatbot.
 * Auth + per-user daily quota (15/day free, unlimited Pro). Also rate-limited
 * to 20 req/min as spam protection.
 */

import { NextRequest, NextResponse } from 'next/server';
import { runAgent } from '@/lib/ai/agent';
import { withAuth, rejectIfTooLarge } from '@/lib/security/api-security';
import { checkRateLimit } from '@/lib/security/rate-limiter';
import { checkQuota } from '@/lib/billing/quotas';
import { logAiCall } from '@/lib/billing/log-ai-call';
import { toSafeErrorMessage } from '@/lib/ai/error-utils';
import { saveConversation } from '@/lib/ai/conversations';
import { validateUUID } from '@/lib/security/input-validation';

async function handler(
  req: NextRequest,
  _ctx: unknown,
  session: { userId: string }
) {
  const tooLarge = rejectIfTooLarge(req, 200 * 1024);
  if (tooLarge) return tooLarge;

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
  const conversationId = typeof body?.conversationId === 'string' && validateUUID(body.conversationId)
    ? body.conversationId
    : null;
  const experienceLevel = (body?.experienceLevel as 'beginner' | 'intermediate' | 'advanced') ?? null;
  const language = (body?.language as string) ?? null;
  const riskProfile = (body?.riskProfile as 'conservative' | 'balanced' | 'aggressive') ?? null;
  const investmentHorizon = (body?.investmentHorizon as 'short' | 'medium' | 'long') ?? null;
  const responseStyle = (body?.responseStyle as 'concise' | 'balanced' | 'detailed') ?? null;
  const allowHoldingsContext = body?.allowHoldingsContext === true;

  try {
    const result = await runAgent(messages, context, experienceLevel, language, riskProfile, investmentHorizon, responseStyle, session.userId, allowHoldingsContext, req.signal);

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

    // onError sanitizes any error that surfaces while the stream is being
    // consumed (e.g. an OpenAI rate limit hit mid-generation) — without this,
    // the SDK's default formatter forwards error.message verbatim, which for
    // APICallError includes the raw upstream response body.
    return result.toUIMessageStreamResponse({
      onError: toSafeErrorMessage,
      // Persistence mode: pass the incoming messages so the callback's `messages`
      // is the full conversation (history + this turn), not just the new reply.
      originalMessages: messages,
      onFinish: conversationId
        ? async ({ messages: fullMessages, isAborted }) => {
            if (isAborted) return;
            await saveConversation(conversationId, session.userId, fullMessages);
          }
        : undefined,
    });
  } catch (err) {
    // Covers failures before streaming could even start (e.g. the initial
    // request to OpenAI is rejected outright).
    console.error('[ai/chat] request failed before streaming started:', err);
    return NextResponse.json({ error: 'ai_unavailable' }, { status: 503 });
  }
}

export const POST = withAuth(handler);
