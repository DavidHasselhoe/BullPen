import { NextRequest, NextResponse, after } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { checkRateLimit } from '@/lib/security/rate-limiter';
import { checkQuota } from '@/lib/billing/quotas';
import { logAiCall } from '@/lib/billing/log-ai-call';
import { createNotification, isNotificationEnabled } from '@/lib/notifications/notifications-db';
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
type DivePhase = 'reading_data' | 'searching' | 'reasoning' | 'composing';

/**
 * Runs the actual generation, persisting progress/result to `stock_deep_dives`
 * as it goes. Scheduled via after() so it keeps running on the server even if
 * the client that started it navigates away or closes the tab — nothing here
 * depends on the originating request/response still being open.
 */
async function runDeepDive(params: {
  id: string;
  userId: string;
  symbol: string;
  lens: DeepDiveLens;
  experienceLevel: ExperienceLevel;
  holds: boolean;
}): Promise<void> {
  const { id, userId, symbol, lens, experienceLevel, holds } = params;
  const supabase = createServerClient();
  const setPhase = (phase: DivePhase) => supabase.from('stock_deep_dives').update({ phase }).eq('id', id);

  try {
    await setPhase('reading_data');
    const data = await gatherDeepDiveData(symbol);
    const companyName = data.profile?.name ?? symbol;
    const archetype = inferArchetype(data.stats);
    const dataBlock = formatDataBlock(data);
    const today = new Date().toISOString().slice(0, 10);

    const userPrompt = buildUserPrompt({
      symbol, companyName, experienceLevel, holds, lens,
      archetypeHint: archetype.hint, dataBlock, today,
    });

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

    let buffered = '';
    let searchStarted = false;
    let reasoningStarted = false;
    let textStarted = false;

    for await (const event of stream) {
      if (event.type === 'content_block_start' &&
          (event.content_block.type === 'server_tool_use' || event.content_block.type === 'tool_use')) {
        if (!searchStarted) { searchStarted = true; await setPhase('searching'); }
      } else if (event.type === 'content_block_delta') {
        const delta = event.delta as { type: string; thinking?: string; text?: string };
        if (delta.type === 'thinking_delta' && delta.thinking) {
          if (!reasoningStarted) { reasoningStarted = true; await setPhase('reasoning'); }
        } else if (delta.type === 'text_delta' && delta.text) {
          if (!textStarted) { textStarted = true; await setPhase('composing'); }
          buffered += delta.text;
        }
      }
    }

    // Log usage (cost is already incurred regardless of parse outcome).
    try {
      const final = await stream.finalMessage();
      void logAiCall({
        userId,
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
      await supabase.from('stock_deep_dives').update({
        status: 'error', phase: null, error_code: safe.code, error_message: safe.message,
      }).eq('id', id);
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

    type DiveUpdate = Database['public']['Tables']['stock_deep_dives']['Update'];
    await supabase.from('stock_deep_dives').update({
      status: 'done',
      phase: null,
      report: report as unknown as DiveUpdate['report'],
      company_name: report.companyName,
      data_as_of: data.dataAsOf,
    }).eq('id', id);

    if (await isNotificationEnabled(userId, 'ai_insights')) {
      await createNotification({
        user_id: userId,
        type: 'ai_insight',
        title: `Your ${symbol} deep dive is ready`,
        message: `The AI analysis of ${report.companyName} has finished — tap to read it.`,
        entity_type: 'stock',
        entity_id: `${symbol}:deep_dive`,
        severity: 'info',
      });
    }
  } catch (err) {
    console.error('[deep-dive] Anthropic error:', err);
    const safe = classifyAiError(err);
    try {
      await supabase.from('stock_deep_dives').update({
        status: 'error', phase: null, error_code: safe.code, error_message: safe.message,
      }).eq('id', id);
    } catch { /* best effort */ }
  }
}

// ─── POST: start a new deep dive (returns immediately, generates in the background) ──

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

  const supabase = createServerClient();
  const { data: inserted, error: insertErr } = await supabase
    .from('stock_deep_dives')
    .insert({
      user_id: session.userId,
      symbol,
      lens,
      model: MODEL,
      status: 'pending',
      phase: 'reading_data',
    })
    .select('id')
    .single();

  if (insertErr || !inserted) {
    console.error('[deep-dive] failed to create pending row:', insertErr?.message);
    return addSecurityHeaders(NextResponse.json({ error: 'Failed to start generation' }, { status: 500 }));
  }

  const id = inserted.id as string;

  after(() => runDeepDive({ id, userId: session.userId, symbol, lens, experienceLevel, holds }));

  return addSecurityHeaders(NextResponse.json({ id, status: 'pending' }));
}

// ─── GET: poll a specific generation by id, or the latest saved + any pending ─

async function getHandler(
  request: NextRequest,
  context: { params: Promise<{ ticker: string }> },
  session: { userId: string }
): Promise<NextResponse> {
  const { ticker } = await context.params;
  const symbol = slugToSymbol(ticker).toUpperCase();
  const id = request.nextUrl.searchParams.get('id');

  const supabase = createServerClient();

  if (id) {
    const { data, error } = await supabase
      .from('stock_deep_dives')
      .select('id, status, phase, report, error_code, error_message, created_at')
      .eq('id', id)
      .eq('user_id', session.userId)
      .maybeSingle();

    if (error || !data) {
      return addSecurityHeaders(NextResponse.json({ success: false, error: 'Not found' }, { status: 404 }));
    }

    return addSecurityHeaders(NextResponse.json({
      success: true,
      id: data.id,
      status: data.status,
      phase: data.phase,
      report: data.report ?? null,
      errorCode: data.error_code ?? null,
      errorMessage: data.error_message ?? null,
      createdAt: data.created_at,
    }));
  }

  const [{ data: latestDone }, { data: pendingRow }] = await Promise.all([
    supabase
      .from('stock_deep_dives')
      .select('id, report, created_at')
      .eq('user_id', session.userId)
      .eq('symbol', symbol)
      .eq('status', 'done')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('stock_deep_dives')
      .select('id, phase')
      .eq('user_id', session.userId)
      .eq('symbol', symbol)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  return addSecurityHeaders(
    NextResponse.json({
      success: true,
      report: latestDone?.report ?? null,
      id: latestDone?.id ?? null,
      createdAt: latestDone?.created_at ?? null,
      pendingId: pendingRow?.id ?? null,
      pendingPhase: pendingRow?.phase ?? null,
    })
  );
}

export const POST = withAuth(postHandler);
export const GET = withAuth(getHandler);
