import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { withAuth, addSecurityHeaders, rejectIfTooLarge } from '@/lib/security/api-security';
import { checkRateLimit } from '@/lib/security/rate-limiter';
import { checkQuota } from '@/lib/billing/quotas';
import { logAiCall } from '@/lib/billing/log-ai-call';
import { classifyAiError } from '@/lib/ai/provider-error';
import { rget, rset } from '@/lib/cache/redis-cache';
import { getStockQuotes, isOutsideRegularSessionET } from '@/lib/twelvedata/twelvedata-client';
import {
  WHY_TODAY_CACHE_TTL,
  WHY_TODAY_MODEL,
  isStale,
  whyTodayKey,
  whyTodayLanguage,
  whyTodayRequest,
  type CachedWhyToday,
  type WhyTodayMove,
} from '@/lib/ai/why-today';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function handler(
  request: NextRequest,
  _ctx: unknown,
  session: { userId: string }
): Promise<NextResponse> {
  const tooLarge = rejectIfTooLarge(request, 20 * 1024);
  if (tooLarge) return tooLarge;

  // Pro-only feature. The quota config has count=0 for free → returns reason: 'pro_only'.
  // (Historical bug: this route used `account_tier === 'free'` against an INT column,
  //  which never matched. Free users had been slipping through.)
  const quota = await checkQuota(session.userId, 'why_today');
  if (!quota.allowed) {
    return addSecurityHeaders(
      NextResponse.json({ error: 'upgrade_required', quota }, { status: 402 })
    );
  }

  // ── Per-user rate limit (10 / min — Anthropic calls are expensive) ────────
  const rateLimitKey = `why-today:${session.userId}`;
  const limit = await checkRateLimit(rateLimitKey, { windowMs: 60_000, maxRequests: 10 });
  if (!limit.allowed) {
    return addSecurityHeaders(
      NextResponse.json({ error: 'Rate limit exceeded. Please try again later.' }, { status: 429 })
    );
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let clientMove: WhyTodayMove, language: string;
  try {
    const body = await request.json();
    clientMove = {
      ticker: String(body.ticker ?? '').toUpperCase().slice(0, 10),
      price: Number(body.price) || 0,
      change: Number(body.change) || 0,
      changePct: Number(body.changePct) || 0,
    };
    language = whyTodayLanguage(body.language);
    if (!clientMove.ticker) throw new Error('missing ticker');
  } catch {
    return addSecurityHeaders(
      NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    );
  }
  const { ticker } = clientMove;

  // The server's own quote: it both decides whether a cached answer still fits
  // and is the only thing allowed into a prompt whose answer gets shared.
  let serverMove: WhyTodayMove | null = null;
  try {
    const q = (await getStockQuotes([ticker], { prepost: isOutsideRegularSessionET() })).get(ticker);
    if (q && Number.isFinite(q.dp) && q.c > 0) serverMove = { ticker, price: q.c, change: q.d, changePct: q.dp };
  } catch { /* fall back to the client's numbers, uncached */ }

  const key = whyTodayKey(ticker, language);
  const cached = await rget<CachedWhyToday>(key);
  const encoder = new TextEncoder();
  const sse = (body: (send: (obj: Record<string, unknown>) => void) => Promise<void>) =>
    new NextResponse(
      new ReadableStream({
        async start(controller) {
          const send = (obj: Record<string, unknown>) =>
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
          try {
            await body(send);
          } finally {
            controller.close();
          }
        },
      }),
      { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' } },
    );

  // Someone already asked today and the move hasn't changed its story: no call.
  if (cached && (!serverMove || !isStale(cached, serverMove.changePct))) {
    return sse(async (send) => {
      send({ type: 'text', delta: cached.text });
      send({ type: 'done' });
    });
  }

  const move = serverMove ?? clientMove;
  return sse(async (send) => {
    try {
      // web_search_20250305 is a built-in tool, so this goes through anthropic.beta.messages.
      const stream = anthropic.beta.messages.stream(whyTodayRequest(move, language));
      let text = '';

      for await (const event of stream) {
        // Web search arrives as server_tool_use. Text before a search is narration
        // ("Let me search..."), so drop it here and on the client.
        if (event.type === 'content_block_start' && event.content_block.type === 'server_tool_use') {
          text = '';
          send({ type: 'searching' });
        }
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          text += event.delta.text;
          send({ type: 'text', delta: event.delta.text });
        }
      }

      // Only an answer built on the server's numbers is safe to share.
      if (serverMove && text.trim()) {
        void rset<CachedWhyToday>(key, { text: text.trim(), changePct: serverMove.changePct, generatedAt: new Date().toISOString() }, WHY_TODAY_CACHE_TTL);
      }

      // Log usage (non-blocking — never block the response)
      try {
        const final = await stream.finalMessage();
        void logAiCall({
          userId: session.userId,
          feature: 'why_today',
          model: WHY_TODAY_MODEL,
          inputTokens: final.usage.input_tokens,
          outputTokens: final.usage.output_tokens,
          webSearches: final.usage.server_tool_use?.web_search_requests ?? 0,
          metadata: { ticker },
        });
      } catch { /* never block */ }

      send({ type: 'done' });
    } catch (err) {
      console.error('[why-today] Anthropic error:', err);
      const safe = classifyAiError(err);
      send({ type: 'error', code: safe.code, message: safe.message });
    }
  });
}

export const POST = withAuth(handler);
