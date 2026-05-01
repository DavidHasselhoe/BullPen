import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { createServerClient } from '@/lib/supabase/client';
import { checkRateLimit } from '@/lib/security/rate-limiter';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function handler(
  request: NextRequest,
  _ctx: unknown,
  session: { userId: string }
): Promise<NextResponse> {
  // ── Tier check ────────────────────────────────────────────────────────────
  const supabase = createServerClient();
  const { data: userRow } = await supabase
    .from('users')
    .select('account_tier')
    .eq('id', session.userId)
    .maybeSingle();

  const tier = userRow?.account_tier ?? 'free';
  if (tier === 'free') {
    return addSecurityHeaders(
      NextResponse.json({ error: 'upgrade_required' }, { status: 403 })
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
  let ticker: string, price: number, change: number, changePct: number;
  try {
    const body = await request.json();
    ticker   = String(body.ticker ?? '').toUpperCase().slice(0, 10);
    price    = Number(body.price)    || 0;
    change   = Number(body.change)   || 0;
    changePct = Number(body.changePct) || 0;
    if (!ticker) throw new Error('missing ticker');
  } catch {
    return addSecurityHeaders(
      NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    );
  }

  // ── Stream Claude's response ──────────────────────────────────────────────
  const direction = changePct >= 0 ? 'up' : 'down';
  const absPct    = Math.abs(changePct).toFixed(2);
  const absDollar = Math.abs(change).toFixed(2);

  const encoder = new TextEncoder();

  const readable = new ReadableStream({
    async start(controller) {
      const send = (obj: Record<string, unknown>) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

      try {
        // web_search_20250305 is a built-in tool — must use anthropic.beta.messages
        const stream = anthropic.beta.messages.stream({
          model: 'claude-sonnet-4-6',
          max_tokens: 600,
          betas: ['web-search-2025-03-05'],
          tools: [{ type: 'web_search_20250305', name: 'web_search' }],
          system:
            'You are a concise financial analyst. Explain why a stock moved today using only what you find in current news. ' +
            'Respond with exactly 2–3 bullet points (each starting with "• "). ' +
            'Name the specific catalyst, event, or news item. Keep each bullet under 25 words. ' +
            'Do not use headers, bold text, or generic market commentary.',
          messages: [{
            role: 'user',
            content:
              `$${ticker} is ${direction} ${absPct}% ($${absDollar}) today. ` +
              `Current price: $${price.toFixed(2)}. ` +
              `Search for the specific news or catalyst driving this move right now.`,
          }],
        });

        for await (const event of stream) {
          if (event.type === 'content_block_start' && event.content_block.type === 'tool_use') {
            send({ type: 'searching' });
          }
          if (
            event.type === 'content_block_delta' &&
            event.delta.type === 'text_delta'
          ) {
            send({ type: 'text', delta: event.delta.text });
          }
        }

        send({ type: 'done' });
      } catch (err) {
        // Log full error in dev so the terminal shows what Anthropic returned
        if (process.env.NODE_ENV === 'development') {
          console.error('[why-today] Anthropic error:', err);
        }
        // Surface a human-readable code so the client can show the right message
        const status = (err as { status?: number })?.status;
        const code = status === 401 ? 'invalid_key'
          : status === 402 || (err instanceof Error && err.message.includes('credit')) ? 'payment_required'
          : status === 429 ? 'rate_limited'
          : 'unknown';
        send({ type: 'error', code, message: err instanceof Error ? err.message : 'Unknown error' });
      } finally {
        controller.close();
      }
    },
  });

  return new NextResponse(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}

export const POST = withAuth(handler);
