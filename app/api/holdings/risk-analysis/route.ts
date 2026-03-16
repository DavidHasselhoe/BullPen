/**
 * Portfolio Risk Analysis API
 *
 * Accepts a holdings payload, sends it to GPT-4o with a specialized risk-analyst
 * system prompt, and returns a structured JSON risk report.
 * Pattern mirrors /api/ai/compare-explain/route.ts.
 */

import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { NextRequest, NextResponse } from 'next/server';
import { withAuth, withRateLimit } from '@/lib/security/api-security';

const RISK_ANALYST_SYSTEM_PROMPT = `You are a senior portfolio risk analyst at a top-tier institutional investment firm. Your task is to produce a rigorous, structured risk assessment of a retail investor's stock portfolio.

You MUST respond with ONLY valid JSON — no markdown fences, no prose, no comments. Any deviation will break the consuming application.

Output this exact schema:
{
  "overallRiskScore": <integer 0-100, where 100 = maximum risk>,
  "riskLevel": <"Low" | "Moderate" | "Elevated" | "High" | "Very High">,
  "metrics": {
    "concentration": { "score": <integer 0-100>, "label": <string>, "detail": <string> },
    "sectorDiversification": { "score": <integer 0-100>, "label": <string>, "detail": <string> },
    "marketCapBias": { "score": <integer 0-100>, "label": <string>, "detail": <string> },
    "volatilityExposure": { "score": <integer 0-100>, "label": <string>, "detail": <string> }
  },
  "topRisks": [
    { "severity": <"critical" | "high" | "medium" | "low">, "factor": <string>, "description": <string> }
  ],
  "sectorBreakdown": [
    { "sector": <string>, "symbols": [<string>], "estimatedWeight": <number 0-100> }
  ],
  "recommendations": [<string>],
  "portfolioSummary": <string>
}

Scoring guidelines:
- overallRiskScore: weighted average — concentration 30%, sectorDiversification 25%, marketCapBias 20%, volatilityExposure 25%
- riskLevel thresholds: 0-20 = Low, 21-40 = Moderate, 41-60 = Elevated, 61-79 = High, 80-100 = Very High
- concentration: score 80+ if top 1 holding > 40%, or top 3 > 75%; score 50-79 if top 3 = 55-75%; score <50 if well spread
- sectorDiversification: score 80+ if >70% in one sector; score 50-79 if 50-70% in one sector; score <50 if no sector exceeds 40%
- marketCapBias: score 70+ if heavy small/micro-cap; score 30-69 for mid-cap mix; score <30 for large/mega-cap dominated
- volatilityExposure: score 80+ for biotech/crypto-adjacent/speculative; 60-79 for high-beta tech; 40-59 for mixed; <40 for defensive sectors
- topRisks: 3-5 items ordered by severity; be specific and name actual ticker symbols
- sectorBreakdown: classify each symbol into its GICS sector; estimatedWeight = approximate % of portfolio in that sector
- recommendations: 3-5 concrete, actionable bullet points mentioning specific ticker symbols where relevant
- portfolioSummary: 2-3 sentence executive-level summary; be honest about risk level and key vulnerabilities
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

async function handler(req: NextRequest, _context: unknown, session: { userId: string }) {
  try {
    const body = await req.json();
    const holdings: HoldingInput[] = body.holdings;

    if (!Array.isArray(holdings) || holdings.length === 0) {
      return NextResponse.json({ success: false, error: 'No holdings provided' }, { status: 400 });
    }

    const totalValue = holdings.reduce((sum, h) => sum + (h.marketValue ?? 0), 0);

    const lines = holdings.map((h) => {
      const parts: string[] = [`${h.symbol} (${h.company_name})`];
      if (h.allocation != null) parts.push(`allocation: ${h.allocation.toFixed(1)}%`);
      if (h.marketValue != null) parts.push(`value: $${h.marketValue.toFixed(0)}`);
      if (h.quantity != null) parts.push(`shares: ${h.quantity}`);
      if (h.dayChangePercent != null)
        parts.push(`today: ${h.dayChangePercent >= 0 ? '+' : ''}${h.dayChangePercent.toFixed(2)}%`);
      if (h.unrealizedPLPercent != null)
        parts.push(
          `unrealized P/L: ${h.unrealizedPLPercent >= 0 ? '+' : ''}${h.unrealizedPLPercent.toFixed(2)}%`
        );
      return parts.join(', ');
    });

    const prompt = `Analyze this portfolio${totalValue > 0 ? ` (total value: $${totalValue.toFixed(0)})` : ''}:\n\n${lines.join('\n')}`;

    const { text } = await generateText({
      model: openai('gpt-4o'),
      system: RISK_ANALYST_SYSTEM_PROMPT,
      prompt,
      maxOutputTokens: 2048,
    });

    // Strip any accidental markdown fences before parsing
    const cleaned = text.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '');
    const analysis = JSON.parse(cleaned);

    return NextResponse.json({ success: true, analysis });
  } catch (err) {
    console.error('[risk-analysis]', err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Failed to generate risk analysis' },
      { status: 500 }
    );
  }
}

/** Auth required; rate limited to 10/min to protect OpenAI usage */
export const POST = withRateLimit(withAuth(handler), { windowMs: 60 * 1000, maxRequests: 10 });
