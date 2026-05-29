/**
 * Portfolio Risk Analysis API
 *
 * Accepts a holdings payload, sends it to Claude Sonnet 4.6 with a specialized
 * risk-analyst system prompt, and returns a structured JSON risk report.
 * Saves the result to risk_analyses so users can revisit without regenerating.
 * Quota: 1 free run/month for free users, unlimited for Pro.
 */

import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';
import { withAuth, withRateLimit, addSecurityHeaders } from '@/lib/security/api-security';
import { checkQuota } from '@/lib/billing/quotas';
import { logAiCall } from '@/lib/billing/log-ai-call';
import { createServerClient } from '@/lib/supabase/client';
import type { Database } from '@/lib/supabase/types';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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
- Use professional financial language; do not sugarcoat high-risk findings`;

interface HoldingInput {
  symbol: string;
  company_name: string;
  allocation?: number;
  marketValue?: number;
  quantity?: number | null;
  dayChangePercent?: number;
  unrealizedPLPercent?: number;
}

// Currency display helpers
const CURRENCY_PREFIXES: Record<string, string> = {
  USD: '$', EUR: '€', GBP: '£', JPY: '¥',
  CAD: 'CA$', AUD: 'A$', CHF: 'Fr.',
};
function currencyPrefix(code: string): string {
  return CURRENCY_PREFIXES[code] ?? `${code} `;
}

async function handler(req: NextRequest, _context: unknown, session: { userId: string }) {
  const quota = await checkQuota(session.userId, 'risk_analysis');
  if (!quota.allowed) {
    return addSecurityHeaders(
      NextResponse.json({ error: 'quota_exceeded', quota }, { status: 402 })
    );
  }

  try {
    const body = await req.json();
    const holdings: HoldingInput[] = body.holdings;
    const currency: string = (typeof body.currency === 'string' && body.currency.length > 0)
      ? body.currency.toUpperCase()
      : 'USD';

    if (!Array.isArray(holdings) || holdings.length === 0) {
      return addSecurityHeaders(
        NextResponse.json({ success: false, error: 'No holdings provided' }, { status: 400 })
      );
    }

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
    const prompt = `Analyze this portfolio${totalValue > 0 ? ` (total value: ${prefix}${totalValue.toFixed(0)})` : ''}:${currencyNote}\n\n${lines.join('\n')}`;

    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: RISK_ANALYST_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    });

    void logAiCall({
      userId: session.userId,
      feature: 'risk_analysis',
      model: 'claude-sonnet-4-6',
      inputTokens: msg.usage.input_tokens,
      outputTokens: msg.usage.output_tokens,
      metadata: { holdingsCount: holdings.length, currency },
    });

    const rawText = msg.content[0].type === 'text' ? msg.content[0].text : '';
    const cleaned = rawText.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '');
    const analysis = JSON.parse(cleaned);
    analysis.generatedAt = new Date().toISOString();

    // Persist the analysis so users can revisit without regenerating.
    let savedId: string | null = null;
    try {
      type RiskInsert = Database['public']['Tables']['risk_analyses']['Insert'];
      const supabase = createServerClient();
      const { data: inserted } = await supabase
        .from('risk_analyses')
        .insert({
          user_id: session.userId,
          analysis: analysis as unknown as RiskInsert['analysis'],
          currency,
          holdings_count: holdings.length,
        } satisfies Omit<RiskInsert, 'id' | 'created_at'>)
        .select('id')
        .single();
      savedId = inserted?.id ?? null;

      // Keep only the 10 most recent analyses per user (cost control).
      const { data: oldest } = await supabase
        .from('risk_analyses')
        .select('id')
        .eq('user_id', session.userId)
        .order('created_at', { ascending: false })
        .range(10, 999);
      if (oldest && oldest.length > 0) {
        await supabase.from('risk_analyses').delete().in('id', oldest.map((r) => (r as { id: string }).id));
      }
    } catch {
      // Never block the response on a save failure.
    }

    return addSecurityHeaders(
      NextResponse.json({ success: true, analysis, savedId })
    );
  } catch (err) {
    console.error('[risk-analysis]', err);
    return addSecurityHeaders(
      NextResponse.json(
        { success: false, error: err instanceof Error ? err.message : 'Failed to generate risk analysis' },
        { status: 500 }
      )
    );
  }
}

export const POST = withRateLimit(withAuth(handler), { windowMs: 60 * 1000, maxRequests: 10 });
