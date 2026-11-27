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
import { rget, rset } from '@/lib/cache/redis-cache';
import { createHash } from 'crypto';

/**
 * Saved per user and pair, so a refresh or a return visit shows the same
 * explanation instead of a blank space and another quota run. Per user, not
 * shared: the prompt is built from client-sent context, and one person's
 * request must never become the text another person reads.
 */
const CACHE_TTL_SECONDS = 7 * 24 * 60 * 60;
const TICKER_RE = /^[A-Z0-9.\-/]{1,12}$/;
// The context's hash is in the key: new numbers for either company make a new explanation, not a stale one.
const cacheKey = (userId: string, tickers: string[], context: string) =>
  `compare-explain:v2:${userId}:${[...tickers].sort().join(',')}:${createHash('sha256').update(context).digest('hex').slice(0, 16)}`;

const MODEL = 'claude-haiku-5-5';

const EXPLAIN_SYSTEM = `You are BullPen AI, a financial research analyst. The user has compared companies using SEC filing data. Your task is to provide a concise, interpretive summary of the key differences, focusing on what the numbers mean for business quality and competitive positioning. Do NOT simply repeat numbers. Offer insight: pricing power, margin structure, growth trajectory, capital efficiency, scale advantages. Write 2-4 short paragraphs. Be professional and specific. Never use an em dash (—) or en dash (–) to connect clauses; use a period or comma instead.`;

async function handler(req: NextRequest, _context: unknown, session: { userId: string }) {
  const tooLarge = rejectIfTooLarge(req, 50 * 1024);
  if (tooLarge) return tooLarge;

  try {
    const body = await req.json();
    const { context, tickers: rawTickers, cachedOnly } = body as { context?: string; tickers?: unknown; cachedOnly?: boolean };
    const tickers = Array.isArray(rawTickers)
      ? rawTickers.filter((x): x is string => typeof x === 'string' && TICKER_RE.test(x)).slice(0, 5)
      : [];
    const key = tickers.length >= 2 && typeof context === 'string' ? cacheKey(session.userId, tickers, context) : null;

    // A saved explanation costs nothing: no quota, no model call.
    const saved = key ? await rget<string>(key) : null;
    if (saved) return NextResponse.json({ success: true, explanation: saved });
    // Page load asking only for a saved one (free users who haven't clicked).
    if (cachedOnly) return NextResponse.json({ success: true, explanation: null });

    // Daily quota (5/day free, unlimited Pro)
    const quota = await checkQuota(session.userId, 'compare_explain');
    if (!quota.allowed) {
      return NextResponse.json({ error: 'quota_exceeded', quota }, { status: 402 });
    }

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

    if (key && result.text) void rset(key, result.text, CACHE_TTL_SECONDS);
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
