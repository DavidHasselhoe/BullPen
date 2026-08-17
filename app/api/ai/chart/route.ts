/**
 * Chart Assistant API — POST handler for the in-chart AI.
 * Shares the same auth, per-minute rate limit, and daily 'chat' quota as the
 * main BullPen AI chat (15/day free, unlimited Pro).
 */

import { NextRequest, NextResponse } from 'next/server';
import { runChartAgent } from '@/lib/ai/chart-agent';
import { withAuth, rejectIfTooLarge } from '@/lib/security/api-security';
import { checkRateLimit } from '@/lib/security/rate-limiter';
import { checkQuota } from '@/lib/billing/quotas';
import { logAiCall } from '@/lib/billing/log-ai-call';
import { toSafeErrorMessage } from '@/lib/ai/error-utils';

async function handler(
  req: NextRequest,
  _ctx: unknown,
  session: { userId: string }
) {
  const tooLarge = rejectIfTooLarge(req, 200 * 1024);
  if (tooLarge) return tooLarge;

  const rl = await checkRateLimit(`ai-chart:${session.userId}`, { windowMs: 60_000, maxRequests: 20 });
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded. Please try again in a minute.' }, { status: 429 });
  }

  const quota = await checkQuota(session.userId, 'chat');
  if (!quota.allowed) {
    return NextResponse.json({ error: 'quota_exceeded', quota }, { status: 402 });
  }

  const body = await req.json().catch(() => ({}));
  const messages = body?.messages ?? [];
  const snapshot = body?.chartContext ?? null;
  const experienceLevel = (body?.experienceLevel as 'beginner' | 'intermediate' | 'advanced') ?? null;
  const language = (body?.language as string) ?? null;

  try {
    const result = await runChartAgent(messages, snapshot, experienceLevel, language);

    void result.usage.then((usage) => {
      void logAiCall({
        userId: session.userId,
        feature: 'chat',
        model: 'gpt-4o',
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
      });
    }).catch(() => { /* logging never blocks */ });

    return result.toUIMessageStreamResponse({ onError: toSafeErrorMessage });
  } catch (err) {
    console.error('[ai/chart] request failed before streaming started:', err);
    return NextResponse.json({ error: 'ai_unavailable' }, { status: 503 });
  }
}

export const POST = withAuth(handler);
