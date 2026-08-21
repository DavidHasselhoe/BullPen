/**
 * Portfolio Risk Analysis API
 *
 * Accepts a holdings payload and runs it through Claude Sonnet 4.6 with a
 * specialized risk-analyst system prompt to produce a structured JSON risk
 * report. POST inserts a `pending` row and returns immediately; the actual
 * generation runs in the background via Next.js after() so it finishes even
 * if the client navigates away or closes the tab — same pattern as AI Deep
 * Dive and Portfolio Builder (see migration 089 / 104). The client polls GET
 * ?id= for status, and a notification fires on completion either way.
 * Quota: 1 free run/month for free users, unlimited for Pro.
 */

import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse, after } from 'next/server';
import { withAuth, addSecurityHeaders, rejectIfTooLarge } from '@/lib/security/api-security';
import { checkRateLimit } from '@/lib/security/rate-limiter';
import { checkQuota } from '@/lib/billing/quotas';
import { logAiCall } from '@/lib/billing/log-ai-call';
import { createNotification, isNotificationEnabled } from '@/lib/notifications/notifications-db';
import { createServerClient } from '@/lib/supabase/client';
import type { Database } from '@/lib/supabase/types';
import { classifyAiError, parseFailure } from '@/lib/ai/provider-error';

export const maxDuration = 300;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = 'claude-sonnet-4-6';
const MAX_SAVED = 10;

// Real progress, not simulated: the output schema's key order is fixed by the
// system prompt (metrics -> topRisks -> sectorBreakdown -> stressScenarios ->
// recommendations -> portfolioSummary), so watching for each key as it lands
// in the streamed text is a genuine signal of how far the model has gotten,
// not a fake timer. Order here must match PHASE_MARKERS below.
type RiskPhase = 'scoring' | 'identifying_risks' | 'modeling_scenarios' | 'finalizing';
const PHASE_MARKERS: Array<{ phase: RiskPhase; marker: string }> = [
  { phase: 'identifying_risks', marker: '"topRisks"' },
  { phase: 'modeling_scenarios', marker: '"stressScenarios"' },
  { phase: 'finalizing', marker: '"recommendations"' },
];

const RISK_ANALYST_SYSTEM_PROMPT = `You are a senior portfolio risk analyst at a top-tier institutional investment firm. Your task is to produce a rigorous, structured risk assessment of a retail investor's stock portfolio.

You MUST respond with ONLY valid JSON — no markdown fences, no prose, no comments. Any deviation will break the consuming application.

Output this exact schema:
{
  "overallRiskScore": <integer 0-100, where 100 = maximum risk>,
  "riskLevel": <"Low" | "Moderate" | "Elevated" | "High" | "Very High">,
  "metrics": {
    "concentration":        { "score": <integer 0-100>, "label": <string>, "detail": <string> },
    "sectorDiversification":{ "score": <integer 0-100>, "label": <string>, "detail": <string> },
    "marketCapBias":        { "score": <integer 0-100>, "label": <string>, "detail": <string> },
    "volatilityExposure":   { "score": <integer 0-100>, "label": <string>, "detail": <string> },
    "correlationRisk":      { "score": <integer 0-100>, "label": <string>, "detail": <string> },
    "liquidityRisk":        { "score": <integer 0-100>, "label": <string>, "detail": <string> }
  },
  "topRisks": [
    { "severity": <"critical" | "high" | "medium" | "low">, "factor": <string>, "description": <string> }
  ],
  "sectorBreakdown": [
    { "sector": <string>, "symbols": [<string>], "estimatedWeight": <number 0-100> }
  ],
  "stressScenarios": [
    { "scenario": <string>, "estimatedImpact": <string>, "severity": <"low" | "medium" | "high"> }
  ],
  "recommendations": [<string>],
  "portfolioSummary": <string>
}

Scoring guidelines:
- overallRiskScore: weighted average — concentration 25%, sectorDiversification 20%, marketCapBias 15%, volatilityExposure 20%, correlationRisk 10%, liquidityRisk 10%
- riskLevel thresholds: 0-20 = Low, 21-40 = Moderate, 41-60 = Elevated, 61-79 = High, 80-100 = Very High
- concentration: score 80+ if top 1 holding > 40%, or top 3 > 75%; score 50-79 if top 3 = 55-75%; score <50 if well spread
- sectorDiversification: score 80+ if >70% in one sector; score 50-79 if 50-70% in one sector; score <50 if no sector exceeds 40%
- marketCapBias: score 70+ if heavy small/micro-cap; score 30-69 for mid-cap mix; score <30 for large/mega-cap dominated
- volatilityExposure: score 80+ for biotech/crypto-adjacent/speculative; 60-79 for high-beta tech; 40-59 for mixed; <40 for defensive sectors
- correlationRisk: score 80+ if >80% of holdings are high-beta tech/growth names that move in lockstep; score 40-79 for mixed growth/value; score <40 if genuinely diversified across growth, value, and defensive
- liquidityRisk: score 80+ if >30% of portfolio value is in small/micro-cap or thinly traded names; score 40-79 for some mid-cap exposure; score <30 if dominated by large/mega-cap liquid names
- stressScenarios: exactly 3 items — (1) a rate-hike cycle scenario, (2) a sector-specific correction for the portfolio's most concentrated sector, (3) a broad market sell-off. For each, estimate a % drawdown range (e.g. "−22% to −35% estimated drawdown") based on the holdings' sector membership, known beta characteristics, and historical analogues. severity: "low" if estimated impact <10%, "medium" if 10-25%, "high" if >25%. Keep scenario names SHORT (5 words max).
- topRisks: 3-5 items ordered by severity; be specific and name actual ticker symbols
- sectorBreakdown: classify each symbol into its GICS sector; estimatedWeight = approximate % of portfolio in that sector
- recommendations: 3-5 concrete, actionable bullet points mentioning specific ticker symbols where relevant
- portfolioSummary: 2-3 sentence executive-level summary; use the portfolio currency provided; be honest about risk level and key vulnerabilities
- Use professional financial language; do not sugarcoat high-risk findings
- In all string fields, never use an em dash (—) or en dash (–) to connect clauses. Use a period, comma, or colon instead.`;

interface HoldingInput {
  symbol: string;
  company_name: string;
  allocation?: number;
  marketValue?: number;
  quantity?: number | null;
  dayChangePercent?: number;
  unrealizedPLPercent?: number;
}

// Minimal position fingerprint — deliberately excludes allocation/marketValue/
// dayChangePercent/unrealizedPLPercent, which drift every run regardless of
// whether the user actually bought or sold anything. Only share count and
// symbol membership represent a real position change.
interface HoldingSnapshotEntry {
  symbol: string;
  quantity: number | null;
}

interface SnapshotDiff {
  added: string[];
  removed: string[];
  resized: Array<{ symbol: string; from: number | null; to: number | null }>;
}

function toSnapshot(holdings: HoldingInput[]): HoldingSnapshotEntry[] {
  return holdings.map((h) => ({ symbol: h.symbol, quantity: h.quantity ?? null }));
}

function diffHoldingsSnapshot(prior: HoldingSnapshotEntry[], current: HoldingSnapshotEntry[]): SnapshotDiff {
  const priorMap = new Map(prior.map((h) => [h.symbol, h.quantity]));
  const currentMap = new Map(current.map((h) => [h.symbol, h.quantity]));

  const added = current.filter((h) => !priorMap.has(h.symbol)).map((h) => h.symbol);
  const removed = prior.filter((h) => !currentMap.has(h.symbol)).map((h) => h.symbol);
  const resized: SnapshotDiff['resized'] = [];
  for (const [symbol, priorQty] of priorMap) {
    if (!currentMap.has(symbol)) continue;
    const currentQty = currentMap.get(symbol) ?? null;
    if (Math.abs((priorQty ?? 0) - (currentQty ?? 0)) > 1e-6) {
      resized.push({ symbol, from: priorQty, to: currentQty });
    }
  }

  return { added, removed, resized };
}

function isUnchanged(diff: SnapshotDiff): boolean {
  return diff.added.length === 0 && diff.removed.length === 0 && diff.resized.length === 0;
}

/**
 * Builds a prompt suffix anchoring the model to the previous score when the
 * portfolio hasn't actually changed, so identical holdings don't get a
 * re-rolled score purely from LLM sampling variance. When holdings HAVE
 * changed, the model is told exactly what changed and asked to explain the
 * delta rather than starting from a totally independent number.
 */
function buildHistoryContext(
  prior: { score: number; level: string; snapshot: HoldingSnapshotEntry[] } | null,
  currentHoldings: HoldingInput[]
): string {
  if (!prior) return '';

  const diff = diffHoldingsSnapshot(prior.snapshot, toSnapshot(currentHoldings));

  if (isUnchanged(diff)) {
    return `\n\nIMPORTANT: You scored this exact portfolio (same holdings, same share counts) ${prior.score}/100 (${prior.level}) last time. Keep the overall score and risk level the same unless you identify a genuinely new external risk factor since then (e.g. a specific holding entered financial distress, a sector-specific shock occurred). Do not vary the score merely due to re-analysis or normal sampling variation: an unchanged portfolio should produce an unchanged score.`;
  }

  const changes: string[] = [];
  if (diff.added.length > 0) changes.push(`added: ${diff.added.join(', ')}`);
  if (diff.removed.length > 0) changes.push(`removed: ${diff.removed.join(', ')}`);
  if (diff.resized.length > 0) {
    changes.push(`resized: ${diff.resized.map((r) => `${r.symbol} (${r.from ?? 0} -> ${r.to ?? 0} shares)`).join(', ')}`);
  }

  return `\n\nSince the last analysis (scored ${prior.score}/100, ${prior.level}), the portfolio changed: ${changes.join('; ')}. Reassess from first principles based on the current holdings below, and in portfolioSummary briefly note how this change moved the score relative to last time.`;
}

// Currency display helpers
const CURRENCY_PREFIXES: Record<string, string> = {
  USD: '$', EUR: '€', GBP: '£', JPY: '¥',
  CAD: 'CA$', AUD: 'A$', CHF: 'Fr.',
};
function currencyPrefix(code: string): string {
  return CURRENCY_PREFIXES[code] ?? `${code} `;
}

function buildPrompt(holdings: HoldingInput[], currency: string): string {
  const prefix = currencyPrefix(currency);
  const totalValue = holdings.reduce((sum, h) => sum + (h.marketValue ?? 0), 0);

  const lines = holdings.map((h) => {
    const parts: string[] = [`${h.symbol} (${h.company_name})`];
    if (h.allocation != null) parts.push(`allocation: ${h.allocation.toFixed(1)}%`);
    if (h.marketValue != null) parts.push(`value: ${prefix}${h.marketValue.toFixed(0)}`);
    if (h.quantity != null) parts.push(`shares: ${h.quantity}`);
    if (h.dayChangePercent != null)
      parts.push(`today: ${h.dayChangePercent >= 0 ? '+' : ''}${h.dayChangePercent.toFixed(2)}%`);
    if (h.unrealizedPLPercent != null)
      parts.push(`unrealized P/L: ${h.unrealizedPLPercent >= 0 ? '+' : ''}${h.unrealizedPLPercent.toFixed(2)}%`);
    return parts.join(', ');
  });

  const currencyNote = currency !== 'USD' ? `\nAll portfolio values are in ${currency}.` : '';
  return `Analyze this portfolio${totalValue > 0 ? ` (total value: ${prefix}${totalValue.toFixed(0)})` : ''}:${currencyNote}\n\n${lines.join('\n')}`;
}

/**
 * Runs the actual analysis, persisting the result to risk_analyses as it
 * goes. Scheduled via after() so it keeps running on the server even if the
 * client that started it navigates away or closes the tab.
 */
async function runRiskAnalysis(params: {
  id: string;
  userId: string;
  holdings: HoldingInput[];
  currency: string;
}): Promise<void> {
  const { id, userId, holdings, currency } = params;
  const supabase = createServerClient();
  const setPhase = (phase: RiskPhase) => supabase.from('risk_analyses').update({ phase }).eq('id', id);
  const markError = (code: string, message: string) =>
    supabase.from('risk_analyses').update({ status: 'error', phase: null, error_code: code, error_message: message }).eq('id', id);

  try {
    const { data: priorRow } = await supabase
      .from('risk_analyses')
      .select('analysis, holdings_snapshot')
      .eq('user_id', userId)
      .eq('status', 'done')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let historyContext = '';
    if (priorRow?.analysis && Array.isArray(priorRow.holdings_snapshot)) {
      const priorAnalysis = priorRow.analysis as { overallRiskScore?: unknown; riskLevel?: unknown };
      if (typeof priorAnalysis.overallRiskScore === 'number' && typeof priorAnalysis.riskLevel === 'string') {
        historyContext = buildHistoryContext(
          {
            score: priorAnalysis.overallRiskScore,
            level: priorAnalysis.riskLevel,
            snapshot: priorRow.holdings_snapshot as unknown as HoldingSnapshotEntry[],
          },
          holdings
        );
      }
    }

    const prompt = buildPrompt(holdings, currency) + historyContext;

    const stream = anthropic.messages.stream({
      model: MODEL,
      max_tokens: 4096,
      temperature: 0,
      system: RISK_ANALYST_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    });

    let buffered = '';
    let nextMarker = 0;
    for await (const event of stream) {
      if (event.type !== 'content_block_delta') continue;
      const delta = event.delta as { type: string; text?: string };
      if (delta.type !== 'text_delta' || !delta.text) continue;
      buffered += delta.text;
      while (nextMarker < PHASE_MARKERS.length && buffered.includes(PHASE_MARKERS[nextMarker].marker)) {
        await setPhase(PHASE_MARKERS[nextMarker].phase);
        nextMarker++;
      }
    }

    const final = await stream.finalMessage();
    void logAiCall({
      userId,
      feature: 'risk_analysis',
      model: MODEL,
      inputTokens: final.usage.input_tokens,
      outputTokens: final.usage.output_tokens,
      metadata: { holdingsCount: holdings.length, currency },
    });

    const cleaned = buffered.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '');

    let analysis: Record<string, unknown>;
    try {
      analysis = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error('[risk-analysis] parse failed:', parseErr);
      const safe = parseFailure();
      await markError(safe.code, safe.message);
      return;
    }
    analysis.generatedAt = new Date().toISOString();

    type RiskUpdate = Database['public']['Tables']['risk_analyses']['Update'];
    await supabase.from('risk_analyses').update({
      status: 'done',
      phase: null,
      analysis: analysis as unknown as RiskUpdate['analysis'],
    }).eq('id', id);

    // Keep only the MAX_SAVED most recent completed analyses per user (cost control).
    const { data: oldest } = await supabase
      .from('risk_analyses')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'done')
      .order('created_at', { ascending: false })
      .range(MAX_SAVED, 999);
    if (oldest && oldest.length > 0) {
      await supabase.from('risk_analyses').delete().in('id', oldest.map((r) => (r as { id: string }).id));
    }

    const riskLevel = typeof analysis.riskLevel === 'string' ? analysis.riskLevel : 'Unknown';
    const score = typeof analysis.overallRiskScore === 'number' ? analysis.overallRiskScore : null;

    if (await isNotificationEnabled(userId, 'ai_insights')) {
      await createNotification({
        user_id: userId,
        type: 'ai_insight',
        title: 'Your portfolio risk analysis is ready',
        message: score != null
          ? `Overall risk: ${riskLevel} (${score}/100). Tap to view the full breakdown.`
          : 'Your risk assessment has finished. Tap to view it.',
        entity_type: 'portfolio',
        entity_id: `risk_analysis:${id}`,
        severity: 'info',
      });
    }
  } catch (err) {
    console.error('[risk-analysis] Anthropic error:', err);
    const safe = classifyAiError(err);
    try {
      await markError(safe.code, safe.message);
    } catch { /* best effort */ }
  }
}

// ─── POST: start a new analysis (returns immediately, runs in the background) ─

async function postHandler(req: NextRequest, _context: unknown, session: { userId: string }) {
  const tooLarge = rejectIfTooLarge(req, 100 * 1024);
  if (tooLarge) return tooLarge;

  const limit = await checkRateLimit(`risk-analysis:${session.userId}`, { windowMs: 60_000, maxRequests: 10 });
  if (!limit.allowed) {
    return addSecurityHeaders(
      NextResponse.json({ error: 'Rate limit exceeded. Please try again in a minute.' }, { status: 429 })
    );
  }

  const quota = await checkQuota(session.userId, 'risk_analysis');
  if (!quota.allowed) {
    return addSecurityHeaders(
      NextResponse.json({ error: 'quota_exceeded', quota }, { status: 402 })
    );
  }

  let holdings: HoldingInput[];
  let currency: string;
  try {
    const body = await req.json();
    holdings = body.holdings;
    currency = (typeof body.currency === 'string' && body.currency.length > 0)
      ? body.currency.toUpperCase()
      : 'USD';

    if (!Array.isArray(holdings) || holdings.length === 0) {
      return addSecurityHeaders(
        NextResponse.json({ success: false, error: 'No holdings provided' }, { status: 400 })
      );
    }
  } catch {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 })
    );
  }

  const supabase = createServerClient();
  type RiskInsert = Database['public']['Tables']['risk_analyses']['Insert'];
  const { data: inserted, error: insertErr } = await supabase
    .from('risk_analyses')
    .insert({
      user_id: session.userId,
      currency,
      holdings_count: holdings.length,
      holdings_snapshot: toSnapshot(holdings) as unknown as RiskInsert['holdings_snapshot'],
      status: 'pending',
      phase: 'scoring',
    })
    .select('id')
    .single();

  if (insertErr || !inserted) {
    console.error('[risk-analysis] failed to create pending row:', insertErr?.message);
    return addSecurityHeaders(NextResponse.json({ error: 'Failed to start analysis' }, { status: 500 }));
  }

  const id = inserted.id as string;

  after(() => runRiskAnalysis({ id, userId: session.userId, holdings, currency }));

  return addSecurityHeaders(NextResponse.json({ id, status: 'pending' }));
}

// ─── GET: poll a specific analysis by id, or check for one still pending ──────

async function getStatusHandler(req: NextRequest, _context: unknown, session: { userId: string }) {
  const id = req.nextUrl.searchParams.get('id');
  const supabase = createServerClient();

  if (id) {
    const { data, error } = await supabase
      .from('risk_analyses')
      .select('id, status, phase, analysis, currency, holdings_count, error_code, error_message, created_at')
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
      analysis: data.analysis ?? null,
      currency: data.currency,
      holdingsCount: data.holdings_count,
      errorCode: data.error_code ?? null,
      errorMessage: data.error_message ?? null,
      createdAt: data.created_at,
    }));
  }

  // No id: is there an analysis still running for this user? (resume-on-mount)
  const { data: pendingRow } = await supabase
    .from('risk_analyses')
    .select('id, phase')
    .eq('user_id', session.userId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return addSecurityHeaders(NextResponse.json({
    success: true,
    pendingId: pendingRow?.id ?? null,
    pendingPhase: (pendingRow?.phase as RiskPhase | null) ?? null,
  }));
}

export const POST = withAuth(postHandler);
export const GET = withAuth(getStatusHandler);
