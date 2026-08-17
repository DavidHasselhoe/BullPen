import { NextRequest, NextResponse, after } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { withAuth, addSecurityHeaders, rejectIfTooLarge } from '@/lib/security/api-security';
import { checkRateLimit } from '@/lib/security/rate-limiter';
import { checkQuota } from '@/lib/billing/quotas';
import { logAiCall } from '@/lib/billing/log-ai-call';
import { createNotification, isNotificationEnabled } from '@/lib/notifications/notifications-db';
import { createServerClient } from '@/lib/supabase/client';
import { PORTFOLIO_BUILDER_SYSTEM_PROMPT } from '@/lib/ai/portfolio-builder/system-prompt';
import {
  parsePortfolio,
  HoldingSchema,
  type Portfolio,
  type PortfolioHolding,
  stripFences,
  extractJsonObject,
} from '@/lib/ai/portfolio-builder/schema';
import { validateTickers } from '@/lib/ai/portfolio-builder/validate-tickers';
import { renormalizeAllocations } from '@/lib/ai/portfolio-builder/renormalize';
import { classifyAiError, parseFailure } from '@/lib/ai/provider-error';
import { z } from 'zod';

export const maxDuration = 300;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = 'claude-sonnet-4-6';
const MAX_SAVED = 50;

type BuilderPhase = 'streaming' | 'composing' | 'validating';

/**
 * Runs the actual generation, persisting progress/result to
 * `portfolio_generations` as it goes. Scheduled via after() so it keeps
 * running on the server even if the client navigates away.
 */
async function runPortfolioBuilder(params: {
  id: string;
  userId: string;
  thesis: string;
}): Promise<void> {
  const { id, userId, thesis } = params;
  const supabase = createServerClient();
  const setPhase = (phase: BuilderPhase) => supabase.from('portfolio_generations').update({ phase }).eq('id', id);
  const markError = (code: string, message: string) =>
    supabase.from('portfolio_generations').update({ status: 'error', phase: null, error_code: code, error_message: message }).eq('id', id);

  try {
    const stream = anthropic.messages.stream({
      model: MODEL,
      max_tokens: 16000,
      temperature: 1,
      thinking: { type: 'enabled', budget_tokens: 8000 },
      system: [{ type: 'text', text: PORTFOLIO_BUILDER_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: thesis }],
    });

    let buffered = '';
    let textStarted = false;
    for await (const event of stream) {
      if (event.type === 'content_block_delta') {
        const delta = event.delta as { type: string; thinking?: string; text?: string };
        if (delta.type === 'text_delta' && delta.text) {
          if (!textStarted) { textStarted = true; await setPhase('composing'); }
          buffered += delta.text;
        }
      }
    }

    try {
      const final = await stream.finalMessage();
      void logAiCall({
        userId,
        feature: 'portfolio_builder',
        model: MODEL,
        inputTokens: final.usage.input_tokens,
        outputTokens: final.usage.output_tokens,
      });
    } catch { /* never block on logging */ }

    let portfolio: Portfolio;
    try {
      portfolio = parsePortfolio(buffered);
    } catch (parseErr) {
      console.error('[portfolio-builder] parse failed:', parseErr);
      const safe = parseFailure();
      await markError(safe.code, safe.message);
      return;
    }

    await setPhase('validating');

    const initialCheck = await validateTickers(portfolio.holdings);
    let validHoldings = initialCheck.validHoldings;
    let logoMap = initialCheck.logoMap;
    const invalidTickers = initialCheck.invalidTickers;
    const replacedTickers: string[] = [];

    if (invalidTickers.length > 0 && validHoldings.length > 0) {
      const replacements = await requestReplacements({ previousAssistantTurn: buffered, invalidTickers, thesis });
      if (replacements.length > 0) {
        const reCheck = await validateTickers(replacements);
        replacedTickers.push(...invalidTickers.filter((t) => !reCheck.invalidTickers.includes(t)));
        validHoldings = [...validHoldings, ...reCheck.validHoldings];
        logoMap = { ...logoMap, ...reCheck.logoMap };
      } else {
        replacedTickers.push(...invalidTickers);
      }
    } else if (invalidTickers.length > 0) {
      replacedTickers.push(...invalidTickers);
    }

    if (validHoldings.length < 3) {
      await markError('too_few_valid_tickers', 'Could not assemble enough verified tickers for this thesis. Try rephrasing.');
      return;
    }

    const finalHoldings = renormalizeAllocations(validHoldings);
    const finalPortfolio = { ...portfolio, holdings: finalHoldings };

    await supabase.from('portfolio_generations').update({
      status: 'done',
      phase: null,
      portfolio: finalPortfolio,
      logo_map: logoMap,
      replaced_tickers: replacedTickers,
    }).eq('id', id);

    // Keep only the newest MAX_SAVED completed generations, same trim the
    // history endpoint used to do on every save.
    const { data: oldest } = await supabase
      .from('portfolio_generations')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'done')
      .order('created_at', { ascending: false })
      .range(MAX_SAVED, 999);
    if (oldest && oldest.length > 0) {
      await supabase.from('portfolio_generations').delete().in('id', oldest.map((r) => r.id));
    }

    if (await isNotificationEnabled(userId, 'ai_insights')) {
      await createNotification({
        user_id: userId,
        type: 'ai_insight',
        title: 'Your portfolio build is ready',
        message: finalPortfolio.theme_summary || 'Your AI-generated portfolio has finished — tap to view it.',
        entity_type: null,
        entity_id: `portfolio_builder:${id}`,
        severity: 'info',
      });
    }
  } catch (err) {
    console.error('[portfolio-builder] Anthropic error:', err);
    const safe = classifyAiError(err);
    try {
      await markError(safe.code, safe.message);
    } catch { /* best effort */ }
  }
}

// ─── POST: start a new build (returns immediately, generates in the background) ─

async function handler(
  request: NextRequest,
  _ctx: unknown,
  session: { userId: string }
): Promise<NextResponse> {
  const tooLarge = rejectIfTooLarge(request, 50 * 1024);
  if (tooLarge) return tooLarge;

  // Per-user rate limit — these are expensive (~4k output tokens each)
  const limit = await checkRateLimit(`portfolio-builder:${session.userId}`, {
    windowMs: 60_000,
    maxRequests: 5,
  });
  if (!limit.allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded. Please try again in a minute.' }, { status: 429 });
  }

  // Monthly free-tier quota (3/mo). Pro users bypass entirely.
  const quota = await checkQuota(session.userId, 'portfolio_builder');
  if (!quota.allowed) {
    return NextResponse.json({ error: 'quota_exceeded', quota }, { status: 402 });
  }

  let thesis: string;
  try {
    const body = await request.json();
    thesis = String(body.thesis ?? '').trim();
    if (thesis.length < 10 || thesis.length > 500) {
      throw new Error('thesis must be 10-500 characters');
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Invalid request body' },
      { status: 400 }
    );
  }

  const supabase = createServerClient();
  const { data: inserted, error: insertErr } = await supabase
    .from('portfolio_generations')
    .insert({
      user_id: session.userId,
      thesis,
      status: 'pending',
      phase: 'streaming',
      logo_map: {},
      replaced_tickers: [],
    })
    .select('id')
    .single();

  if (insertErr || !inserted) {
    console.error('[portfolio-builder] failed to create pending row:', insertErr?.message);
    return NextResponse.json({ error: 'Failed to start generation' }, { status: 500 });
  }

  const id = inserted.id as string;

  after(() => runPortfolioBuilder({ id, userId: session.userId, thesis }));

  return NextResponse.json({ id, status: 'pending' });
}

// ─── GET: poll a specific generation by id, or check for one still pending ────

async function getStatusHandler(
  request: NextRequest,
  _ctx: unknown,
  session: { userId: string }
): Promise<NextResponse> {
  const id = request.nextUrl.searchParams.get('id');
  const supabase = createServerClient();

  if (id) {
    const { data, error } = await supabase
      .from('portfolio_generations')
      .select('id, thesis, status, phase, portfolio, logo_map, replaced_tickers, error_code, error_message, created_at')
      .eq('id', id)
      .eq('user_id', session.userId)
      .maybeSingle();

    if (error || !data) {
      return addSecurityHeaders(NextResponse.json({ success: false, error: 'Not found' }, { status: 404 }));
    }

    return addSecurityHeaders(NextResponse.json({
      success: true,
      id: data.id,
      thesis: data.thesis,
      status: data.status,
      phase: data.phase,
      portfolio: data.portfolio ?? null,
      logoMap: data.logo_map ?? {},
      replacedTickers: data.replaced_tickers ?? [],
      errorCode: data.error_code ?? null,
      errorMessage: data.error_message ?? null,
    }));
  }

  // No id: is there a build still running for this user? (resume-on-mount)
  const { data: pendingRow } = await supabase
    .from('portfolio_generations')
    .select('id, thesis, phase')
    .eq('user_id', session.userId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return addSecurityHeaders(NextResponse.json({
    success: true,
    pendingId: pendingRow?.id ?? null,
    pendingThesis: pendingRow?.thesis ?? null,
    pendingPhase: pendingRow?.phase ?? null,
  }));
}

/**
 * Follow-up Claude call: feed the prior assistant response back along with the list of
 * invalid tickers and ask for substitutes. Non-streaming — we just need the JSON.
 */
async function requestReplacements({
  previousAssistantTurn,
  invalidTickers,
  thesis,
}: {
  previousAssistantTurn: string;
  invalidTickers: string[];
  thesis: string;
}): Promise<PortfolioHolding[]> {
  try {
    const result = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1500,
      system: [
        {
          type: 'text',
          text: PORTFOLIO_BUILDER_SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [
        { role: 'user', content: thesis },
        { role: 'assistant', content: previousAssistantTurn },
        {
          role: 'user',
          content: `Holdings ${invalidTickers.join(', ')} are not valid US-listed tickers (verify against NYSE/NASDAQ). Replace each with a real, liquid alternative that fills the same role and subsector exposure in the portfolio.

Return ONLY a JSON array (no other fields, no fences) of replacement holdings, one per invalid ticker, each matching the original holding schema:
[{ "ticker", "company", "exchange", "sector", "subsector_exposure", "allocation_pct", "role", "rationale", "thesis_exposure_score", "key_risk", "risk_level" }]`,
        },
      ],
    });

    const textBlock = result.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') return [];

    const cleaned = stripFences(textBlock.text);
    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      // Recover by extracting the first array
      const arrStart = cleaned.indexOf('[');
      const arrEnd = cleaned.lastIndexOf(']');
      if (arrStart === -1 || arrEnd === -1) {
        // Last-ditch: maybe the model returned a wrapped object
        parsed = JSON.parse(extractJsonObject(cleaned));
      } else {
        parsed = JSON.parse(cleaned.slice(arrStart, arrEnd + 1));
      }
    }

    const arraySchema = z.array(HoldingSchema);
    return arraySchema.parse(parsed);
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[portfolio-builder] replacement request failed:', err);
    }
    return [];
  }
}

export type { Portfolio, PortfolioHolding };

export const POST = withAuth(handler);
export const GET = withAuth(getStatusHandler);
