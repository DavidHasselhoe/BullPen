import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { checkRateLimit } from '@/lib/security/rate-limiter';
import { checkQuota } from '@/lib/billing/quotas';
import { logAiCall } from '@/lib/billing/log-ai-call';
import { createServerClient } from '@/lib/supabase/client';
import type { Database } from '@/lib/supabase/types';
import { slugToSymbol } from '@/lib/assets/asset-type';
import { gatherDeepDiveData, formatDataBlock } from '@/lib/ai/deep-dive/gather-data';
import { inferArchetype } from '@/lib/ai/deep-dive/archetype';
import { DEEP_DIVE_SYSTEM_PROMPT, buildUserPrompt } from '@/lib/ai/deep-dive/system-prompt';
import { parseModelReport, isLens, type DeepDiveLens, type DeepDiveReport } from '@/lib/ai/deep-dive/schema';
import { classifyAiError, parseFailure } from '@/lib/ai/provider-error';

export const maxDuration = 300;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = 'claude-sonnet-4-6';
const THINKING_BUDGET = 4000;

type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced';

// ─── POST: generate a new deep dive (SSE) ─────────────────────────────────────

async function postHandler(
  request: NextRequest,
  context: { params: Promise<{ ticker: string }> },
  session: { userId: string }
): Promise<NextResponse> {
  const { ticker } = await context.params;
  const symbol = slugToSymbol(ticker).toUpperCase();

  // Quota: free 1/month, Pro soft-capped. Viewing saved dives is free (GET, below).
  const quota = await checkQuota(session.userId, 'deep_dive');
  if (!quota.allowed) {
    return addSecurityHeaders(
      NextResponse.json({ error: 'quota_exceeded', quota }, { status: 402 })
    );
  }

  // Per-minute rate limit — each run is expensive (thinking + web search).
  const limit = await checkRateLimit(`deep-dive:${session.userId}`, { windowMs: 60_000, maxRequests: 3 });
  if (!limit.allowed) {
    return addSecurityHeaders(
      NextResponse.json({ error: 'Rate limit exceeded. Please wait a minute and try again.' }, { status: 429 })
    );
  }

  // Body
  let lens: DeepDiveLens = 'full';
  let experienceLevel: ExperienceLevel = 'intermediate';
  let holds = false;
  try {
    const body = await request.json().catch(() => ({}));
    if (typeof body.lens === 'string' && isLens(body.lens)) lens = body.lens;
    if (body.experienceLevel === 'beginner' || body.experienceLevel === 'advanced') experienceLevel = body.experienceLevel;
    holds = body.holds === true;
  } catch { /* defaults */ }

  // Gather the data backbone (warm cache → live fallback).
  const data = await gatherDeepDiveData(symbol);
  const companyName = data.profile?.name ?? symbol;
  const archetype = inferArchetype(data.stats);
  const dataBlock = formatDataBlock(data);
  const today = new Date().toISOString().slice(0, 10);

  const userPrompt = buildUserPrompt({
    symbol, companyName, experienceLevel, holds, lens,
    archetypeHint: archetype.hint, dataBlock, today,
  });

  const encoder = new TextEncoder();

  const readable = new ReadableStream({
    async start(controller) {
      const send = (obj: Record<string, unknown>) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

      let buffered = '';

      try {
        const stream = anthropic.beta.messages.stream({
          model: MODEL,
          max_tokens: 10_000,
          temperature: 1,
          thinking: { type: 'enabled', budget_tokens: THINKING_BUDGET },
          betas: ['web-search-2025-03-05'],
          tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 6 }],
          system: [{ type: 'text', text: DEEP_DIVE_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
          messages: [{ role: 'user', content: userPrompt }],
        });

        let textStarted = false;
        for await (const event of stream) {
          if (event.type === 'content_block_start' &&
              (event.content_block.type === 'server_tool_use' || event.content_block.type === 'tool_use')) {
            send({ type: 'searching' });
          } else if (event.type === 'content_block_delta') {
            const delta = event.delta as { type: string; thinking?: string; text?: string };
            if (delta.type === 'thinking_delta' && delta.thinking) {
              send({ type: 'thinking', delta: delta.thinking });
            } else if (delta.type === 'text_delta' && delta.text) {
              if (!textStarted) { textStarted = true; send({ type: 'composing' }); }
              buffered += delta.text;
            }
          }
        }

        // Log usage (cost is already incurred regardless of parse outcome).
        try {
          const final = await stream.finalMessage();
          void logAiCall({
            userId: session.userId,
            feature: 'deep_dive',
            model: MODEL,
            inputTokens: final.usage.input_tokens,
            outputTokens: final.usage.output_tokens,
            metadata: { symbol, lens },
          });
        } catch { /* never block on logging */ }

        // Parse + validate
        let model;
        try {
          model = parseModelReport(buffered);
        } catch (parseErr) {
          console.error('[deep-dive] parse failed:', parseErr);
          const safe = parseFailure();
          send({ type: 'error', code: safe.code, message: safe.message });
          return;
        }

        const report: DeepDiveReport = {
          ...model,
          ticker: symbol,
          companyName: model.companyName || companyName,
          lens,
          model: MODEL,
          generatedAt: new Date().toISOString(),
          dataAsOf: data.dataAsOf,
        };

        // Persist server-side so revisits are instant and free.
        let id: string | null = null;
        try {
          const supabase = createServerClient();
          type DiveInsert = Database['public']['Tables']['stock_deep_dives']['Insert'];
          const { data: inserted } = await supabase
            .from('stock_deep_dives')
            .insert({
              user_id: session.userId,
              symbol,
              company_name: report.companyName,
              lens,
              report: report as unknown as DiveInsert['report'],
              model: MODEL,
              data_as_of: data.dataAsOf,
            })
            .select('id')
            .single();
          id = inserted?.id ?? null;
        } catch { /* still return the report even if save fails */ }

        send({ type: 'done', report, id });
      } catch (err) {
        console.error('[deep-dive] Anthropic error:', err);
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

// ─── GET: most recent saved dive for this symbol (free to view) ───────────────

async function getHandler(
  request: NextRequest,
  context: { params: Promise<{ ticker: string }> },
  session: { userId: string }
): Promise<NextResponse> {
  const { ticker } = await context.params;
  const symbol = slugToSymbol(ticker).toUpperCase();

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('stock_deep_dives')
    .select('id, report, created_at')
    .eq('user_id', session.userId)
    .eq('symbol', symbol)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return addSecurityHeaders(NextResponse.json({ success: false, error: 'Database error' }, { status: 500 }));
  }

  return addSecurityHeaders(
    NextResponse.json({
      success: true,
      report: data?.report ?? null,
      id: data?.id ?? null,
      createdAt: data?.created_at ?? null,
    })
  );
}

export const POST = withAuth(postHandler);
export const GET = withAuth(getHandler);
