/**
 * AI Compare Explanation API
 * Generates a short analytical interpretation of a company comparison.
 * Uses existing financial data only — no market/price data.
 */

import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/utils/logger';
import { withAuth, withRateLimit } from '@/lib/security/api-security';
import { checkQuota } from '@/lib/billing/quotas';
import { logAiCall } from '@/lib/billing/log-ai-call';

const EXPLAIN_SYSTEM = `You are BullPen AI, a financial research analyst. The user has compared companies using SEC filing data. Your task is to provide a concise, interpretive summary of the key differences—focus on what the numbers mean for business quality and competitive positioning. Do NOT simply repeat numbers. Offer insight: pricing power, margin structure, growth trajectory, capital efficiency, scale advantages. Write 2-4 short paragraphs. Be professional and specific.`;

async function handler(req: NextRequest, _context: unknown, session: { userId: string }) {
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
      model: openai('gpt-4o'),
      system: EXPLAIN_SYSTEM,
      prompt: `Based on the following company comparison data from SEC filings, provide an analytical explanation of the key differences. Focus on interpretation and insight, not number repetition.\n\n${context}`,
      maxOutputTokens: 600,
    });

    void logAiCall({
      userId: session.userId,
      feature: 'compare_explain',
      model: 'gpt-4o',
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
    });

    return NextResponse.json({ success: true, explanation: result.text });
  } catch (err) {
    logger.error('[compare-explain]', err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Failed to generate explanation' },
      { status: 500 }
    );
  }
}

/** Auth required; rate limited to 15/min to protect OpenAI usage */
export const POST = withRateLimit(withAuth(handler), { windowMs: 60 * 1000, maxRequests: 15 });
