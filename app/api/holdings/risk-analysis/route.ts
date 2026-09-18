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
import { catLabel, type HealthGrade } from '@/lib/finance/health-score';
import { buildRiskScenario, type RiskScenario } from '@/lib/ai/risk-scenario';
import { parseScenarioShare } from '@/lib/ai/risk-scenario-shares';
import { computePortfolioHealth, type TickerHealth } from '@/lib/finance/portfolio-health';
import {
  buildHistoryContext,
  buildPrompt,
  toSnapshot,
  type HoldingFundamentals,
  type HoldingInput,
  type HoldingSnapshotEntry,
  type PortfolioHealthSummary,
} from '@/lib/ai/risk-analysis-prompt';

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
  "scoreChangeReason": <string, or null>,
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

Data rules:
- Each holding line may carry reported data after a "|": sector and industry, market cap (USD), beta, and a 0-100 health score with its category scores. When present, use it instead of estimating: marketCapBias and liquidityRisk from the market caps, volatilityExposure and correlationRisk from the betas and sectors, sectorBreakdown from the given sectors. Estimate only for holdings marked "fundamentals: none on file", and say in that metric's detail which holdings were estimated.
- Health measures business quality, where higher is better: the opposite direction of your risk scores. A large position with a weak category (for example Financial Strength under 10/25, or a D or F grade) is a risk worth naming in topRisks, with the ticker and the category.
- Never invent a sector, market cap, beta or health score that was not given.

Scoring guidelines:
- scoreChangeReason: null unless the user message gives you prior-analysis context to compare against. When context is given and your score matches the prior score exactly, set this to null. When context is given and your score differs from the prior score (whether because holdings changed or because you identified a new external risk factor), this field is REQUIRED: 2-3 sentences starting with "Since your last analysis," that name the SPECIFIC cause — the exact holdings added/removed/resized, or the exact external event (a rate decision, an earnings miss, a guidance cut, a sector-wide selloff) — never a vague statement like "market conditions changed."
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

const HEALTH_CATEGORY_COLUMNS = [
  ['Profitability', 'health_profitability', 30],
  ['Financial Strength', 'health_financial_strength', 25],
  ['Valuation', 'health_valuation', 20],
  ['Growth', 'health_growth', 15],
  ['Market Risk', 'health_market_risk', 10],
] as const;

type HealthCategoryColumn = (typeof HEALTH_CATEGORY_COLUMNS)[number][1];

type ScreenerFundamentalsRow = {
  ticker: string;
  sector: string | null;
  industry: string | null;
  market_cap: number | null;
  beta: number | null;
  health_score: number | null;
  health_score_grade: string | null;
} & Record<HealthCategoryColumn, number | null>;

/**
 * Reported data for each holding, read here on the server rather than taken
 * from the request so an analysis can't be fed invented numbers. Symbols the
 * screener has no row for (crypto, very new listings) are simply absent, and
 * the prompt marks them as having nothing on file.
 */
async function loadFundamentals(
  supabase: ReturnType<typeof createServerClient>,
  symbols: string[]
): Promise<Map<string, HoldingFundamentals>> {
  const { data } = await supabase
    .from('screener_stats')
    .select(`ticker, sector, industry, market_cap, beta, health_score, health_score_grade, ${HEALTH_CATEGORY_COLUMNS.map(([, col]) => col).join(', ')}`)
    .in('ticker', symbols)
    .returns<ScreenerFundamentalsRow[]>();

  return new Map((data ?? []).map((r) => [r.ticker.toUpperCase(), {
    sector: r.sector,
    industry: r.industry,
    marketCap: r.market_cap,
    beta: r.beta,
    healthScore: r.health_score,
    healthGrade: r.health_score_grade as HealthGrade | null,
    categories: HEALTH_CATEGORY_COLUMNS.map(([name, col, max]) => ({ name, score: r[col], max })),
  }]));
}

/**
 * The portfolio's business-quality score, from the same computePortfolioHealth
 * the petal card on the Holdings page uses, over the same screener_stats data
 * (see app/api/holdings/health-summary/route.ts), so the two can't disagree.
 */
function summarizePortfolioHealth(
  holdings: HoldingInput[],
  fundamentals: Map<string, HoldingFundamentals>
): PortfolioHealthSummary | null {
  const healthBySymbol = new Map<string, TickerHealth>();
  for (const [symbol, f] of fundamentals) {
    if (f.healthScore == null || !f.healthGrade) continue;
    healthBySymbol.set(symbol, {
      score: f.healthScore,
      grade: f.healthGrade,
      categories: f.categories.map((c) => ({
        name: c.name,
        score: c.score ?? 0,
        max: c.max,
        label: c.score == null ? 'Unavailable' : catLabel(c.score, c.max),
        dataAvailable: c.score != null,
      })),
    });
  }
  const health = computePortfolioHealth(
    // A what-if carries weights and no money on purpose, and a value-weighted
    // average only needs the proportions, so allocation stands in for value.
    holdings.map((h) => ({ symbol: h.symbol.toUpperCase(), marketValue: h.marketValue ?? h.allocation })),
    healthBySymbol
  );
  return health
    ? { score: health.score, grade: health.grade, coveredCount: health.coveredCount, totalCount: health.totalCount }
    : null;
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
  /** Set when this run is a what-if on a book the user does not hold. */
  scenarioNote?: string | null;
  /** The same scenario as data, saved with the report for the banner. */
  scenarioSummary?: { count: number; theme: string; share: number } | null;
}): Promise<void> {
  const { id, userId, holdings, currency, scenarioNote, scenarioSummary } = params;
  const supabase = createServerClient();
  const setPhase = (phase: RiskPhase) => supabase.from('risk_analyses').update({ phase }).eq('id', id);
  const markError = (code: string, message: string) =>
    supabase.from('risk_analyses').update({ status: 'error', phase: null, error_code: code, error_message: message }).eq('id', id);

  try {
    // A what-if is never compared against anything and never becomes the
    // thing a later run is compared against: "since your last analysis you
    // sold NVDA" about a position that was only ever hypothetical is worse
    // than no comparison at all.
    const { data: priorRow } = scenarioNote
      ? { data: null }
      : await supabase
        .from('risk_analyses')
        .select('analysis, holdings_snapshot')
        .eq('user_id', userId)
        .eq('status', 'done')
        .is('scenario_note', null)
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
            // Every grounded analysis stores the key, null included.
            grounded: 'portfolioHealth' in priorAnalysis,
          },
          holdings
        );
      }
    }

    const fundamentals = await loadFundamentals(supabase, holdings.map((h) => h.symbol.toUpperCase()));
    const portfolioHealth = summarizePortfolioHealth(holdings, fundamentals);
    // A what-if has to be named as one in the prompt too, or the report comes
    // back telling someone to trim a position they were only considering.
    const scenarioContext = scenarioNote
      ? `\n\nThis is a hypothetical portfolio, not the one this investor holds today. ${scenarioNote} Lines marked PROPOSED are positions being weighed up; every other line is genuinely held. Write the whole report about the combined book as it would stand if the proposal were bought, say plainly where a risk comes from the proposed side, and phrase recommendations as what this combination would mean rather than as instructions to sell something. Never describe a proposed position as owned.`
      : '';
    const prompt = buildPrompt(holdings, currency, fundamentals, portfolioHealth) + scenarioContext + historyContext;

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
    // Carried inside the report as well as on the row, so every path that
    // renders one (fresh poll, restored by id) shows what was added without
    // either route having to pass it separately.
    if (scenarioSummary) analysis.scenario = scenarioSummary;
    // Saved with the analysis so a restored one shows the quality it was
    // scored against, not today's. Null (not absent) when nothing had data.
    analysis.portfolioHealth = portfolioHealth;

    type RiskUpdate = Database['public']['Tables']['risk_analyses']['Update'];
    await supabase.from('risk_analyses').update({
      status: 'done',
      phase: null,
      analysis: analysis as unknown as RiskUpdate['analysis'],
    }).eq('id', id);

    // Keep only the MAX_SAVED most recent completed analyses per user (cost
    // control), counting real ones only so a run of what-ifs can't evict
    // them. What-ifs keep just the latest: one is a result being read, an
    // older one is a portfolio that was never bought.
    const { data: oldest } = await supabase
      .from('risk_analyses')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'done')
      .is('scenario_note', null)
      .order('created_at', { ascending: false })
      .range(MAX_SAVED, 999);
    if (oldest && oldest.length > 0) {
      await supabase.from('risk_analyses').delete().in('id', oldest.map((r) => (r as { id: string }).id));
    }
    if (scenarioNote) {
      const { data: staleScenarios } = await supabase
        .from('risk_analyses')
        .select('id')
        .eq('user_id', userId)
        .eq('status', 'done')
        .not('scenario_note', 'is', null)
        .order('created_at', { ascending: false })
        .range(1, 999);
      if (staleScenarios && staleScenarios.length > 0) {
        await supabase.from('risk_analyses').delete().in('id', staleScenarios.map((r) => (r as { id: string }).id));
      }
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
  let scenarioNote: string | null = null;
  let scenarioSummary: RiskScenario['summary'] | null = null;
  try {
    const body = await req.json();
    holdings = body.holdings;
    currency = (typeof body.currency === 'string' && body.currency.length > 0)
      ? body.currency.toUpperCase()
      : 'USD';

    // A what-if is assembled here from the user's own positions and one of
    // their own generations, never from the request: a client that could
    // post any holdings list could get a risk report on a portfolio that
    // isn't theirs, then find it waiting on their holdings page.
    const share = parseScenarioShare(body.scenario?.share);
    if (typeof body.scenario?.generationId === 'string' && share) {
      const scenario = await buildRiskScenario(session.userId, body.scenario.generationId, share);
      if (!scenario) {
        return addSecurityHeaders(
          NextResponse.json({ success: false, error: 'scenario_unavailable' }, { status: 400 })
        );
      }
      holdings = scenario.holdings;
      scenarioNote = scenario.note;
      scenarioSummary = scenario.summary;
    }

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
      scenario_note: scenarioNote,
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

  after(() => runRiskAnalysis({ id, userId: session.userId, holdings, currency, scenarioNote, scenarioSummary }));

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
