/**
 * Pre-report consensus estimates for the single-company earnings deep-dive
 * carousel — run well ahead of the actual report (there's no realtime
 * requirement here, unlike lib/edgar/edgar-watch.ts's job of catching the
 * actuals the moment they drop), so a Claude web-search call is an
 * acceptable cost/latency tradeoff the same way earnings-web-search.ts
 * already uses it for report-date discovery.
 *
 * DATA FIDELITY: every field here is meant to be a real, publicly reported
 * analyst-consensus figure (Zacks, Yahoo Finance "Analyst Estimates",
 * Visible Alpha, Nasdaq, or a company's own prior-quarter press release for
 * the historical margin figure) — never Claude's own calculation. A field
 * comes back null when a dedicated search for it turns up nothing, which
 * the render layer already treats as a legitimate "N/A" state (see
 * DeepDive*Slide components in lib/instagram/render/slides.tsx).
 */

import Anthropic from '@anthropic-ai/sdk';
import { logAiCall } from '@/lib/billing/log-ai-call';
import { checkAnthropicDailySpend } from '@/lib/billing/anthropic-spend-guard';

const MODEL = 'claude-sonnet-5';
const MAX_SEARCHES = 10;

// Lazily constructed rather than at module scope: when this module is
// imported from a plain tsx script (scripts/watch-earnings.ts) rather than
// a Next.js API route, dotenv's config() call runs AFTER static imports are
// resolved (ESM hoists imports before other top-level statements), so
// process.env.ANTHROPIC_API_KEY isn't set yet at module-evaluation time —
// verified live 2026-08-26, this threw "Could not resolve authentication
// method" on the very first watch-earnings.ts run. A Next.js route doesn't
// hit this since the framework loads .env.local before any route module
// ever imports.
let _anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _anthropic;
}

export interface DeepDiveEstimates {
  companyName: string | null;
  epsEstimate: number | null;
  revenueEstimate: number | null; // dollars
  segmentRevenueEstimate: number | null; // dollars, only if segmentLabel was given
  guidanceConsensus: number | null; // next-quarter revenue consensus, dollars
  grossMarginPriorQuarterPercent: number | null; // last reported quarter's actual gross margin
}

const SYSTEM_PROMPT = `You research pre-earnings analyst consensus figures for a financial app, for ONE specific company ahead of its upcoming report.

Work through dedicated searches, one metric at a time — do not guess or estimate anything yourself, and do not rely on a number you happened to glance at while searching for something else:
1. The company's official/legal display name (e.g. "NVIDIA Corporation").
2. Consensus/analyst EPS estimate for the upcoming quarter (e.g. "<TICKER> EPS estimate Zacks", "<TICKER> earnings estimate this quarter").
3. Consensus/analyst total revenue estimate for the upcoming quarter, in dollars (e.g. "<TICKER> revenue estimate this quarter").
4. If given a named business segment, the consensus revenue estimate for THAT segment specifically (e.g. "<TICKER> <segment> revenue estimate").
5. The consensus/analyst revenue estimate for the NEXT quarter after the one about to be reported, if analysts have already published one (used as a guidance comparison point) — e.g. "<TICKER> next quarter revenue estimate".
6. The company's actual (already reported) gross margin percentage from its most recently completed quarter — a plain historical fact from its last earnings release, not a projection.

Rules:
- Every number must come from an actual search result, not your own calculation or general knowledge.
- Revenue figures must be plain dollar amounts (e.g. 46700000000 for $46.7 billion), not abbreviated strings.
- EPS and margin are plain numbers (e.g. 1.58, 71.3).
- Use null for anything a dedicated search genuinely could not confirm.

Output ONLY a JSON object, nothing else, no markdown fences:
{"companyName": "...", "epsEstimate": 1.58, "revenueEstimate": 46700000000, "segmentRevenueEstimate": null, "guidanceConsensus": 48500000000, "grossMarginPriorQuarterPercent": 71.3}`;

function isFiniteOrNull(v: unknown): v is number | null {
  return v === null || (typeof v === 'number' && Number.isFinite(v));
}

function parseEstimates(raw: string): DeepDiveEstimates {
  const stripped = raw.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '');
  const jsonStr = stripped.match(/\{[\s\S]*\}/)?.[0] ?? stripped;
  const parsed = JSON.parse(jsonStr) as Record<string, unknown>;

  const companyName = typeof parsed.companyName === 'string' ? parsed.companyName : null;
  const epsEstimate = isFiniteOrNull(parsed.epsEstimate) ? parsed.epsEstimate : null;
  const revenueEstimate = isFiniteOrNull(parsed.revenueEstimate) ? parsed.revenueEstimate : null;
  const segmentRevenueEstimate = isFiniteOrNull(parsed.segmentRevenueEstimate) ? parsed.segmentRevenueEstimate : null;
  const guidanceConsensus = isFiniteOrNull(parsed.guidanceConsensus) ? parsed.guidanceConsensus : null;
  const grossMarginPriorQuarterPercent = isFiniteOrNull(parsed.grossMarginPriorQuarterPercent) ? parsed.grossMarginPriorQuarterPercent : null;

  return { companyName, epsEstimate, revenueEstimate, segmentRevenueEstimate, guidanceConsensus, grossMarginPriorQuarterPercent };
}

/**
 * Fetches pre-report consensus figures for one ticker. `segmentLabel` is
 * optional — pass it (e.g. "Data Center") when the company has one
 * standout, commonly-tracked segment worth a dedicated estimate; omit it
 * for companies without a single obvious segment to call out.
 *
 * Returns a result with every field null (never throws) if the daily
 * Anthropic spend cap is already hit — the caller (the seed step) should
 * still create the draft row, just with unconfirmed estimates, rather than
 * fail the whole pipeline over a cost guard.
 */
export async function fetchDeepDiveEstimates(ticker: string, segmentLabel?: string): Promise<DeepDiveEstimates> {
  const empty: DeepDiveEstimates = {
    companyName: null, epsEstimate: null, revenueEstimate: null,
    segmentRevenueEstimate: null, guidanceConsensus: null, grossMarginPriorQuarterPercent: null,
  };

  const spend = await checkAnthropicDailySpend();
  if (!spend.allowed) {
    console.error(`[earnings-deep-dive-estimates] skipped for ${ticker} — daily Anthropic spend cap reached`);
    return empty;
  }

  const userPrompt = `Ticker: ${ticker}.${segmentLabel ? ` Named segment to also estimate: "${segmentLabel}".` : ' No specific segment requested — leave segmentRevenueEstimate null.'} Find the pre-earnings consensus figures now.`;

  const message = await getAnthropic().messages.create({
    model: MODEL,
    max_tokens: 1200,
    thinking: { type: 'disabled' },
    system: SYSTEM_PROMPT,
    tools: [{
      type: 'web_search_20260209',
      name: 'web_search',
      max_uses: MAX_SEARCHES,
      allowed_callers: ['direct'],
    }],
    messages: [{ role: 'user', content: userPrompt }],
  });

  void logAiCall({
    userId: null,
    feature: 'instagram_content',
    model: MODEL,
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
    metadata: { contentType: 'earnings_deep_dive', step: 'estimates', ticker },
  });

  const textBlocks = message.content.filter((b) => b.type === 'text');
  const text = textBlocks.map((b) => (b.type === 'text' ? b.text : '')).join('\n');
  if (!text.trim()) return empty;

  try {
    return parseEstimates(text);
  } catch (err) {
    console.error(`[earnings-deep-dive-estimates] parse failed for ${ticker}:`, err, 'raw:', text.slice(0, 500));
    return empty;
  }
}
