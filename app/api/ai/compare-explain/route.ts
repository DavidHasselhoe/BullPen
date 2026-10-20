/**
 * AI Compare Explanation API
 * Generates a short analytical interpretation of a company comparison.
 * Uses existing financial data only — no market/price data.
 */

import { generateText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/utils/logger';
import { withAuth, withRateLimit, rejectIfTooLarge } from '@/lib/security/api-security';
import { checkQuota } from '@/lib/billing/quotas';
import { logAiCall } from '@/lib/billing/log-ai-call';
import { classifyAiError } from '@/lib/ai/provider-error';

const MODEL = 'claude-haiku-5-5';

const EXPLAIN_SYSTEM = `You are BullPen AI, a financial research analyst. The user has compared companies using SEC filing data. Your task is to provide a concise, interpretive summary of the key differences, focusing on what the numbers mean for business quality and competitive positioning. Do NOT simply repeat numbers. Offer insight: pricing power, margin structure, growth trajectory, capital efficiency, scale advantages. Write 2-4 short paragraphs. Be professional and specific. Never use an em dash (—) or en dash (–) to connect clauses; use a period or comma instead.`;

async function handler(req: NextRequest, _context: unknown, session: { userId: string }) {
  const tooLarge = rejectIfTooLarge(req, 50 * 1024);
  if (tooLarge) return tooLarge;

  // Daily quota (5/day free, unlimited Pro)
  const quota = await checkQuota(session.userId, 'compare_explain');
  if (!quota.allowed) {
    return NextResponse.json({ error: 'quota_exceeded', quota }, { status: 402 });
  }

  try {
    const body = await req.json();
    const { context } = body as { context: string };

    if (!context || typeof context !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Missing context' },
        { status: 400 }
      );
    }

    const result = await generateText({
      model: anthropic(MODEL),
      system: EXPLAIN_SYSTEM,
      prompt: `Based on the following company comparison data from SEC filings, provide an analytical explanation of the key differences. Focus on interpretation and insight, not number repetition.\n\n${context}`,
      // Thinking is on by default on Haiku 5.5 and counts toward this cap.
      maxOutputTokens: 2000,
      providerOptions: { anthropic: { effort: 'low' } },
    });

    void logAiCall({
      userId: session.userId,
      feature: 'compare_explain',
      model: MODEL,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
    });

    return NextResponse.json({ success: true, explanation: result.text });
  } catch (err) {
    logger.error('[compare-explain]', err);
    const safe = classifyAiError(err);
    return NextResponse.json(
      { success: false, error: safe.message, code: safe.code },
      { status: safe.status }
    );
  }
}

/** Auth required; rate limited to 15/min to protect AI usage */
export const POST = withRateLimit(withAuth(handler), { windowMs: 60 * 1000, maxRequests: 15 });
