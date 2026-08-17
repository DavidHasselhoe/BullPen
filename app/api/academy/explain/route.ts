/**
 * POST /api/academy/explain
 * Streams a 1–2 sentence beginner-friendly explanation of an investing term.
 * Hits academy_glossary_cache first; on miss, streams from Claude Haiku and
 * persists the full text to the cache for next time.
 */

import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { withAuth, addSecurityHeaders, rejectIfTooLarge } from '@/lib/security/api-security';
import { checkQuota } from '@/lib/billing/quotas';
import { checkRateLimit } from '@/lib/security/rate-limiter';
import { logAiCall } from '@/lib/billing/log-ai-call';
import { createServerClient } from '@/lib/supabase/client';
import { classifyAiError } from '@/lib/ai/provider-error';

const MODEL = 'claude-haiku-4-5-20251001';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const BodySchema = z.object({
  term: z.string().trim().min(1).max(80),
  context: z.string().max(400).optional(),
});

function normalizeTerm(t: string): string {
  return t.trim().toLowerCase();
}

async function handler(
  req: NextRequest,
  _ctx: unknown,
  session: { userId: string }
): Promise<NextResponse> {
  const tooLarge = rejectIfTooLarge(req, 10 * 1024);
  if (tooLarge) return tooLarge;

  // ── Per-user daily quota (30/day, applies to all tiers since cache absorbs repeats) ──
  const quota = await checkQuota(session.userId, 'academy_explain');
  if (!quota.allowed) {
    return addSecurityHeaders(
      NextResponse.json({ error: 'quota_exceeded', quota }, { status: 402 })
    );
  }

  // ── Per-user burst rate limit (8/min) ──
  const burst = await checkRateLimit(`academy-explain:${session.userId}`, {
    windowMs: 60_000,
    maxRequests: 8,
  });
  if (!burst.allowed) {
    return addSecurityHeaders(
      NextResponse.json({ error: 'Rate limit exceeded. Please try again later.' }, { status: 429 })
    );
  }

  // ── Parse + validate body ──
  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch {
    return addSecurityHeaders(
      NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    );
  }

  const termKey = normalizeTerm(body.term);
  const supabase = createServerClient();
  // Academy tables aren't yet in the generated Supabase types — cast at write site only.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  // ── Cache lookup ──
  const { data: cached } = await supabase
    .from('academy_glossary_cache')
    .select('explanation')
    .eq('term', termKey)
    .maybeSingle<{ explanation: string }>();

  const encoder = new TextEncoder();

  // Cache hit → emit the whole text in one chunk and finish.
  if (cached?.explanation) {
    const readable = new ReadableStream({
      start(controller) {
        const send = (obj: Record<string, unknown>) =>
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
        send({ type: 'cached' });
        send({ type: 'text', delta: cached.explanation });
        send({ type: 'done' });
        controller.close();
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

  // ── Cache miss → stream from Claude Haiku and persist ──
  const userPrompt = body.context
    ? `Explain the investing term "${body.term}" in 1–2 simple sentences for a beginner. Context: ${body.context}`
    : `Explain the investing term "${body.term}" in 1–2 simple sentences for a beginner.`;

  const readable = new ReadableStream({
    async start(controller) {
      const send = (obj: Record<string, unknown>) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

      let fullText = '';

      try {
        const stream = anthropic.messages.stream({
          model: MODEL,
          max_tokens: 180,
          system:
            'You are a friendly investing tutor for absolute beginners. ' +
            'Explain terms in plain, conversational English. No jargon. No bullets. ' +
            'Hard limit: 2 sentences. Never start with "A " followed by the term itself. ' +
            'Never use an em dash (—) or en dash (–) to connect clauses; use a period or comma instead.',
          messages: [{ role: 'user', content: userPrompt }],
        });

        for await (const event of stream) {
          if (
            event.type === 'content_block_delta' &&
            event.delta.type === 'text_delta'
          ) {
            fullText += event.delta.text;
            send({ type: 'text', delta: event.delta.text });
          }
        }

        send({ type: 'done' });

        // Persist to cache (fire-and-forget — never block the response)
        if (fullText.trim().length > 0) {
          void db
            .from('academy_glossary_cache')
            .upsert({ term: termKey, explanation: fullText.trim() }, { onConflict: 'term' });
        }

        // Log usage
        try {
          const final = await stream.finalMessage();
          void logAiCall({
            userId: session.userId,
            feature: 'academy_explain',
            model: MODEL,
            inputTokens: final.usage.input_tokens,
            outputTokens: final.usage.output_tokens,
            metadata: { term: termKey },
          });
        } catch {
          /* never block */
        }
      } catch (err) {
        console.error('[academy/explain] Anthropic error:', err);
        const safe = classifyAiError(err);
        send({ type: 'error', code: safe.code, message: safe.message });
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
