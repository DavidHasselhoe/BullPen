/**
 * Extracts structured actuals from a just-filed earnings press release (the
 * SEC 8-K exhibit lib/edgar/edgar-watch.ts fetches the moment it lands) for
 * the single-company earnings deep-dive carousel.
 *
 * Unlike earnings-deep-dive-estimates.ts (a web search for consensus
 * figures gathered from third parties), every number here is extracted
 * directly from the primary source document itself — no search, no
 * inference beyond what the release states or a release explicitly computes
 * (e.g. "expects revenue of $X billion, plus or minus 2%" -> a low/high
 * range). Claude never invents a figure the text doesn't contain; a field
 * comes back null when the release doesn't state it, which the render layer
 * already treats as a legitimate "N/A" state.
 *
 * GAAP vs non-GAAP: extracts both EPS and gross margin under each basis and
 * uses non-GAAP as the primary "actual" for beat/miss display — that's the
 * basis most retail-facing consensus sources (Zacks, Yahoo Finance) quote
 * for a company like NVIDIA that reports both, so it's the fairer
 * apples-to-apples comparison against the estimate step's web-searched
 * consensus figure. See project_earnings_unconfirmed_fix memory: a prior
 * GAAP/non-GAAP mismatch silently broke a different earnings feature, so
 * this is a known sharp edge worth being deliberate about, not an
 * afterthought.
 */

import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { logAiCall } from '@/lib/billing/log-ai-call';

const MODEL = 'claude-sonnet-5-5';

// Lazy — see earnings-deep-dive-estimates.ts's getAnthropic() comment: a
// module-scope client breaks when this is imported from a plain tsx script
// where dotenv loads env vars after static imports already resolved.
let _anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _anthropic;
}

const ExtractedSchema = z.object({
  companyName: z.string().nullable(),
  fiscalPeriodLabel: z.string().nullable(),
  epsActualGaap: z.number().nullable(),
  epsActualNonGaap: z.number().nullable(),
  epsAdjustmentNote: z.string().nullable(),
  revenueActual: z.number().nullable(), // dollars
  revenueYoyGrowthPercent: z.number().nullable(),
  segmentRevenueActual: z.number().nullable(), // dollars, only if a segment label was given
  segmentYoyGrowthPercent: z.number().nullable(),
  grossMarginActualGaapPercent: z.number().nullable(),
  grossMarginActualNonGaapPercent: z.number().nullable(),
  operatingMarginNonGaapPercent: z.number().nullable(),
  freeCashFlow: z.number().nullable(), // dollars
  guidanceRevenueLow: z.number().nullable(), // dollars
  guidanceRevenueHigh: z.number().nullable(), // dollars
  reportTiming: z.enum(['BMO', 'AMC']).nullable(),
  outlookDirection: z.enum(['raised', 'maintained', 'lowered', 'initiated', 'mixed']).nullable(),
  outlookNote: z.string().nullable(),
  grossMarginGuidancePercent: z.number().nullable(), // next quarter, midpoint
  grossMarginGuidanceIsNonGaap: z.boolean().nullable(),
  capexActual: z.number().nullable(), // dollars, positive
  capexPriorYear: z.number().nullable(), // dollars, positive
  keyMetricLabel: z.string().nullable(),
  keyMetricValueText: z.string().nullable(),
  keyMetricYoyPercent: z.number().nullable(),
});

export type ExtractedEarnings = z.infer<typeof ExtractedSchema>;

function buildSystemPrompt(segmentLabel?: string): string {
  return `You extract structured financial facts from an official company earnings press release. Extract ONLY what the text explicitly states or explicitly computes (e.g. "revenue guidance of $X billion, plus or minus 2%" -> compute the low/high dollar range yourself; a stated year-over-year percent -> use it directly). Never invent, estimate, or infer a number the text doesn't support — use null instead.

Rules:
- Dollar figures are plain numbers in dollars, not abbreviated strings (e.g. 46743000000 for "$46.7 billion" or "$46,743 million").
- EPS and percentages are plain numbers (e.g. 1.05, 72.4). A negative EPS (loss) is a negative number.
- "GAAP" and "non-GAAP" (sometimes called "adjusted") are usually both reported side by side for EPS and gross margin — extract both. If the release reports only one basis, put that number in the GAAP field and leave the non-GAAP field null.
- Exception: when the release itself states what EPS would have been excluding a one-time item (e.g. "excluding this charge, diluted EPS would have been $7.40"), put that stated figure in epsActualNonGaap, even if the release calls nothing "non-GAAP". Only use a figure the release states; never subtract a charge yourself. Then set epsAdjustmentNote to a short plain phrase naming what it excludes and its GAAP EPS, e.g. "excludes a $9.89 billion one-time legal charge; GAAP EPS was $3.83". Otherwise epsAdjustmentNote is null.
- ${segmentLabel ? `Extract revenue specifically for the "${segmentLabel}" segment/business line if the release breaks it out by that name (or an obvious equivalent).` : 'No specific segment was requested — leave segmentRevenueActual and segmentYoyGrowthPercent null.'}
- "freeCashFlow" is operating cash flow minus capital expenditures, only if the release states a free cash flow figure directly (or explicitly labels one line "free cash flow") — do not compute it yourself from separate operating cash flow and capex lines unless the release places them adjacent specifically to state free cash flow.
- Guidance figures are for the NEXT quarter (the quarter after the one just reported), not the quarter just reported.
- reportTiming: "AMC" if the release says after market close / after the bell, "BMO" if before market open, null if genuinely unclear.
- fiscalPeriodLabel: which fiscal period this release reports, exactly as the company itself states it (nearly always right in the headline/title, e.g. "NVIDIA Announces Financial Results for Second Quarter Fiscal 2026" or "Reports Q2 FY26 Results"). Normalize to a short "Q<n> FY<yyyy>" form (e.g. "Q2 FY2026") when the release names a specific quarter; use "FY<yyyy>" alone (e.g. "FY2026") when it's a full fiscal-year report with no quarter named (e.g. "IREN Reports FY26 Results"). Expand a 2-digit fiscal year to 4 digits. This is the company's OWN fiscal calendar, which for many companies does not match the calendar year — never compute or guess it from the filing date, only from what the release itself states.

- outlookDirection: how the company's FULL-YEAR REVENUE or EARNINGS (EPS, operating income) outlook changed versus its own previous outlook, only when the release says so ("raises", "reaffirms", "lowers", or states the previous figures next to the new ones). "initiated" = a first full-year outlook. "mixed" = revenue outlook and earnings outlook moved in opposite directions (e.g. revenue raised, EPS lowered). Expense, cost or capital spending guidance never sets this field, in either direction: a higher spending outlook is not a "raised" outlook to an investor. Put such a change in outlookNote and leave outlookDirection null unless a revenue or earnings outlook also changed. null if the release gives no full-year revenue or earnings outlook or doesn't say how it compares.
- outlookNote: the single most important outlook figure or change, in the release's own numbers, at most 100 characters, plain words, no dashes between clauses. E.g. "2026 revenue $91B to $92B, was $85B to $87B" or "Q4 gross margin guided to 58%, below this quarter's 59.4%" or "2026 capital spending $135B to $145B". Include a capital spending or margin outlook here when the release gives one and it changed. null if the release gives no outlook at all.
- grossMarginGuidancePercent: the gross margin the company guides for the NEXT quarter, as a percent; the midpoint when a range or "plus or minus" is given (e.g. "59.5% plus or minus 50 basis points" -> 59.5). Use non-GAAP when both bases are guided, GAAP when only GAAP is. null if no gross margin outlook is given.
- grossMarginGuidanceIsNonGaap: true if that guided gross margin is non-GAAP (adjusted), false if it is GAAP, null when there is no gross margin outlook.
- capexActual / capexPriorYear: capital expenditures for the THREE-MONTH quarter just reported and for the same quarter a year earlier, as positive dollars, from the cash flow statement ("purchases of property and equipment", "capital expenditures"; include finance-lease principal only if the release itself adds it into one stated capex figure). null when the release only shows year-to-date figures, never derive a quarter by subtracting year-to-date columns.
- keyMetricLabel / keyMetricValueText / keyMetricYoyPercent: the one operating figure the release itself highlights for this business that is NOT total revenue or EPS (e.g. "AWS revenue" "$33.0B" 20; "Gross dollar volume" "$3.0T" 9; "Vehicle deliveries" "497K" 7; "Mounjaro revenue" "$7.2B" 54). keyMetricValueText is short, as the release states it, at most 12 characters. keyMetricYoyPercent only if stated. All null if the release highlights nothing beyond revenue and EPS.

Output ONLY a JSON object with exactly these fields, no markdown fences, no commentary:
{"companyName": string|null, "fiscalPeriodLabel": string|null, "epsActualGaap": number|null, "epsActualNonGaap": number|null, "epsAdjustmentNote": string|null, "revenueActual": number|null, "revenueYoyGrowthPercent": number|null, "segmentRevenueActual": number|null, "segmentYoyGrowthPercent": number|null, "grossMarginActualGaapPercent": number|null, "grossMarginActualNonGaapPercent": number|null, "operatingMarginNonGaapPercent": number|null, "freeCashFlow": number|null, "guidanceRevenueLow": number|null, "guidanceRevenueHigh": number|null, "reportTiming": "BMO"|"AMC"|null, "outlookDirection": "raised"|"maintained"|"lowered"|"initiated"|"mixed"|null, "outlookNote": string|null, "grossMarginGuidancePercent": number|null, "grossMarginGuidanceIsNonGaap": boolean|null, "capexActual": number|null, "capexPriorYear": number|null, "keyMetricLabel": string|null, "keyMetricValueText": string|null, "keyMetricYoyPercent": number|null}`;
}

/**
 * `pressReleaseText` and optional `commentaryText` (e.g. NVIDIA's separate
 * CFO commentary exhibit, which often carries the guidance range more
 * explicitly than the press release itself) are both plain text, already
 * stripped of HTML by fetchExhibitText. Throws on a malformed model
 * response or failed schema validation — this is the one call in the
 * pipeline where a silent wrong answer (a fabricated number shown as fact
 * to real Instagram followers) is worse than a loud failure the operator
 * has to look at.
 */
export async function extractEarningsActuals(
  ticker: string,
  pressReleaseText: string,
  commentaryText?: string,
  segmentLabel?: string
): Promise<ExtractedEarnings> {
  const userContent = commentaryText
    ? `TICKER: ${ticker}\n\n=== PRESS RELEASE ===\n${pressReleaseText}\n\n=== CFO COMMENTARY (guidance detail) ===\n${commentaryText}`
    : `TICKER: ${ticker}\n\n=== PRESS RELEASE ===\n${pressReleaseText}`;

  const message = await getAnthropic().messages.create({
    model: MODEL,
    // Thinking is on by default on Sonnet 5.5 and counts toward max_tokens.
    max_tokens: 4000,
    output_config: { effort: 'low' },
    system: buildSystemPrompt(segmentLabel),
    messages: [{ role: 'user', content: userContent }],
  });

  void logAiCall({
    userId: null,
    feature: 'instagram_content',
    model: MODEL,
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
    metadata: { contentType: 'earnings_deep_dive', step: 'extract_actuals', ticker },
  });

  const textBlock = message.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('Claude returned no text content for earnings-deep-dive extraction');
  }

  const stripped = textBlock.text.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '');
  const jsonStr = stripped.match(/\{[\s\S]*\}/)?.[0] ?? stripped;

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (err) {
    throw new Error(`earnings-deep-dive extraction JSON parse failed: ${err}. Raw (first 400 chars): ${stripped.slice(0, 400)}`);
  }

  const result = ExtractedSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`earnings-deep-dive extraction schema validation failed: ${result.error.message}`);
  }
  // Slide text is never cut (CLAUDE.md), so a line too long for its row is
  // dropped rather than sliced. Losing an optional story row beats failing
  // the whole extraction over it.
  const d = result.data;
  const fits = (s: string | null, max: number) => (s && s.trim().length <= max ? s.trim() : null);
  d.outlookNote = fits(d.outlookNote, 120);
  d.keyMetricLabel = fits(d.keyMetricLabel, 40);
  d.keyMetricValueText = fits(d.keyMetricValueText, 16);
  if (!d.keyMetricLabel || !d.keyMetricValueText) {
    d.keyMetricLabel = null;
    d.keyMetricValueText = null;
    d.keyMetricYoyPercent = null;
  }
  // "Azure revenue growth: 48%" already is the growth; "+48% vs a year ago" under it repeats it.
  if (d.keyMetricValueText?.includes('%')) d.keyMetricYoyPercent = null;
  return d;
}
