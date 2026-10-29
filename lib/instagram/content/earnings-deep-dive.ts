/**
 * Single-company earnings deep-dive carousel — orchestrates the two-phase
 * pipeline:
 *
 *   1. seedEarningsDeepDiveDraft() — run well AHEAD of the report (any time
 *      after the report date is known). Fetches consensus estimates
 *      (earnings-deep-dive-estimates.ts) and stages a 'draft' instagram_posts
 *      row with only the *_estimate fields populated.
 *
 *   2. completeEarningsDeepDiveFromFiling() — run the MOMENT the SEC 8-K
 *      lands (lib/edgar/edgar-watch.ts detects it, scripts/watch-earnings.ts
 *      drives the poll loop). Extracts actuals from the real press release
 *      (earnings-deep-dive-extract.ts), computes beat/miss/inline against
 *      the draft's estimates, writes the Claude-authored headline/caption,
 *      and flips the row to 'ready' — same review-then-manual-publish
 *      pattern every other Instagram content type here uses.
 *
 * Splitting into two phases (rather than one function called at trigger
 * time) means the estimate search — the slow, non-time-critical half — never
 * sits on the critical path between "filing detected" and "post staged for
 * review," which is the whole point of watching EDGAR in the first place.
 */

import Anthropic from '@anthropic-ai/sdk';
import { createServerClient } from '@/lib/supabase/client';
import { fetchDeepDiveEstimates } from './earnings-deep-dive-estimates';
import type { ExtractedEarnings } from './earnings-deep-dive-extract';
import { logAiCall } from '@/lib/billing/log-ai-call';
import { checkAnthropicDailySpend } from '@/lib/billing/anthropic-spend-guard';
import { fetchRevenueGrowthHistory } from '@/lib/edgar/revenue-history';
import { fetchNasdaqEarningsDay, fetchNasdaqEpsSurprises } from '@/lib/market-data/nasdaq-earnings-calendar';
import { buildStoryPoints, statusFor } from './deep-dive-story';

// Lazy — see earnings-deep-dive-estimates.ts's getAnthropic() comment: a
// module-scope client breaks when this is imported from a plain tsx script
// where dotenv loads env vars after static imports already resolved.
let _anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _anthropic;
}
import { totalSlideCount } from '@/lib/instagram/render/slides';
import { postToDiscord } from '@/lib/discord/post-message';
import { resolveLogoUrl, FIXED_HASHTAGS } from './shared';
import type { EarningsDeepDiveData, EarningsDeepDiveSlides } from './schema';

import { SITE_URL } from '@/lib/site';
const MODEL = 'claude-sonnet-5-5';
const CONTENT_TYPE = 'earnings_deep_dive';

const DEEP_DIVE_DISCLAIMER = 'Not financial advice. Figures sourced from the company\'s own earnings release and public analyst consensus estimates.';

function periodKeyFor(ticker: string, reportDate: string): string {
  return `${ticker.toUpperCase()}-${reportDate}`;
}

function surprisePercent(estimate: number | null, actual: number | null): number | null {
  if (estimate == null || actual == null || estimate === 0) return null;
  return ((actual - estimate) / Math.abs(estimate)) * 100;
}

/**
 * EPS surprise % for the company's last 4 reported quarters, newest first, so
 * a beat can be read against its own habit: an 8% beat is a letdown from a
 * company that usually beats by 25%.
 *
 * From Nasdaq, not TwelveData's /earnings: TD mixes GAAP and adjusted actuals
 * (AMZN's July row read +216%, META's history held a $1.61 estimate). Free, no
 * credits. A quarter past 50% either way is still treated as a basis mismatch
 * and skipped, and fewer than 3 usable quarters means no history at all.
 * ponytail: fixed 50% outlier cut, a per-company basis check if it misfires.
 */
export async function fetchEpsSurpriseHistory(ticker: string, reportDate: string): Promise<number[] | null> {
  const surprises = (await fetchNasdaqEpsSurprises(ticker))
    .filter((r) => r.date < reportDate && Math.abs(r.surprisePercent) <= 50)
    .map((r) => r.surprisePercent)
    .slice(0, 4);
  return surprises.length >= 3 ? surprises : null;
}

interface InstagramPostRow {
  id: string;
  status: string;
  slides: EarningsDeepDiveSlides;
}

/**
 * Stage the draft row ahead of the report. Idempotent per (ticker,
 * reportDate) via the same UNIQUE(content_type, period_key) constraint every
 * other content type relies on — calling this twice for the same report
 * just returns the existing row's id rather than erroring or duplicating.
 */
export async function seedEarningsDeepDiveDraft(params: {
  ticker: string;
  reportDate: string; // YYYY-MM-DD
  reportTiming: 'BMO' | 'AMC' | null;
  segmentLabel?: string;
}): Promise<{ postId: string; alreadyExisted: boolean }> {
  const ticker = params.ticker.toUpperCase();
  const periodKey = periodKeyFor(ticker, params.reportDate);

  const supabase = createServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any; // instagram_posts isn't in the generated Database type yet

  const { data: existing } = await db
    .from('instagram_posts')
    .select('id')
    .eq('content_type', CONTENT_TYPE)
    .eq('period_key', periodKey)
    .maybeSingle();

  if (existing) return { postId: existing.id as string, alreadyExisted: true };

  // History for the story slide is fetched here, hours ahead, so nothing new
  // sits between "filing detected" and "post staged". Either may be null.
  const [estimates, revenueGrowthHistory, epsSurpriseHistory] = await Promise.all([
    fetchDeepDiveEstimates(ticker, params.segmentLabel),
    fetchRevenueGrowthHistory(ticker, params.reportDate).catch((err) => {
      console.error(`[earnings-deep-dive] ${ticker} revenue history failed:`, err);
      return null;
    }),
    fetchEpsSurpriseHistory(ticker, params.reportDate),
  ]);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || SITE_URL;
  const logoUrl = await resolveLogoUrl(appUrl, ticker);

  const data: EarningsDeepDiveData = {
    contentType: CONTENT_TYPE,
    ticker,
    companyName: estimates.companyName ?? ticker,
    logoUrl,
    reportDate: params.reportDate,
    reportTiming: params.reportTiming,
    fiscalPeriodLabel: null,
    epsEstimate: estimates.epsEstimate,
    epsActual: null,
    epsStatus: null,
    epsSurprisePercent: null,
    revenueEstimate: estimates.revenueEstimate,
    revenueActual: null,
    revenueStatus: null,
    revenueYoyGrowthPercent: null,
    segmentLabel: params.segmentLabel ?? null,
    segmentRevenueActual: null,
    segmentYoyGrowthPercent: null,
    grossMarginActualPercent: null,
    grossMarginPriorQuarterPercent: estimates.grossMarginPriorQuarterPercent,
    secondaryMetricLabel: null,
    secondaryMetricValue: null,
    secondaryMetricIsCurrency: false,
    guidanceRevenueLow: null,
    guidanceRevenueHigh: null,
    guidanceConsensus: estimates.guidanceConsensus,
    whyThisMatters: null,
    afterHoursChangePercent: null,
    revenueGrowthHistory,
    epsSurpriseHistory,
    headline: null,
    caption: null,
  };

  const { data: inserted, error } = await db
    .from('instagram_posts')
    .insert({
      content_type: CONTENT_TYPE,
      period_key: periodKey,
      status: 'draft',
      slides: { contentType: CONTENT_TYPE, data } satisfies EarningsDeepDiveSlides,
      caption: '', // filled in once completeEarningsDeepDiveFromFiling writes the real caption
    })
    .select('id')
    .single();

  if (error || !inserted) {
    throw new Error(`Failed to insert earnings_deep_dive draft: ${error?.message ?? 'unknown error'}`);
  }

  return { postId: inserted.id as string, alreadyExisted: false };
}

/** The consensus figures, in the order a reader misses them. */
const ESTIMATE_FIELDS = [
  'epsEstimate',
  'revenueEstimate',
  'guidanceConsensus',
  'grossMarginPriorQuarterPercent',
] as const;

/**
 * Fill in any consensus figures the seed step couldn't find, by searching
 * again closer to the report.
 *
 * The estimates matter as much as the actuals here: the beat or miss against
 * consensus is what moves the stock, so a report without them isn't a thinner
 * post, it's a post missing the part that explains the reaction. The publish
 * guard blocks on exactly that, which makes an empty seed a silent kill for
 * the whole post rather than a cosmetic gap.
 *
 * Why a second attempt finds what the first couldn't: the search depends on
 * pre-earnings preview coverage, and that gets published through the US
 * trading day. Measured across the six deep dives generated so far, the four
 * seeded between 9:33 and 11:01 ET all came back with estimates, and the two
 * seeded at 7:19 ET, before the market opened, came back with none of them.
 * Running again once the market has closed puts the search where the coverage
 * is.
 *
 * Only touches a draft, and only writes fields that are still null. A fresh
 * null never overwrites a figure the seed already confirmed, and once the row
 * has left 'draft' the actuals are merged in, where a late estimate change
 * would quietly rewrite a beat into a miss.
 */
export async function refreshDraftEstimates(params: {
  ticker: string;
  reportDate: string;
  segmentLabel?: string;
}): Promise<{ attempted: boolean; filled: string[]; stillMissing: string[] }> {
  const ticker = params.ticker.toUpperCase();
  const periodKey = periodKeyFor(ticker, params.reportDate);

  const supabase = createServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const { data: row } = (await db
    .from('instagram_posts')
    .select('id, status, slides')
    .eq('content_type', CONTENT_TYPE)
    .eq('period_key', periodKey)
    .maybeSingle()) as { data: InstagramPostRow | null };

  if (!row || row.status !== 'draft') return { attempted: false, filled: [], stillMissing: [] };

  const data = row.slides.data;
  const missingBefore = ESTIMATE_FIELDS.filter((k) => data[k] == null);
  if (missingBefore.length === 0) return { attempted: false, filled: [], stillMissing: [] };

  const fresh = await fetchDeepDiveEstimates(ticker, params.segmentLabel);

  const merged: EarningsDeepDiveData = { ...data };
  const filled: string[] = [];

  if (merged.epsEstimate == null && fresh.epsEstimate != null) {
    merged.epsEstimate = fresh.epsEstimate;
    filled.push('epsEstimate');
  }
  if (merged.revenueEstimate == null && fresh.revenueEstimate != null) {
    merged.revenueEstimate = fresh.revenueEstimate;
    filled.push('revenueEstimate');
  }
  if (merged.guidanceConsensus == null && fresh.guidanceConsensus != null) {
    merged.guidanceConsensus = fresh.guidanceConsensus;
    filled.push('guidanceConsensus');
  }
  if (merged.grossMarginPriorQuarterPercent == null && fresh.grossMarginPriorQuarterPercent != null) {
    merged.grossMarginPriorQuarterPercent = fresh.grossMarginPriorQuarterPercent;
    filled.push('grossMarginPriorQuarterPercent');
  }
  // The seed falls back to the bare ticker when the name search came up empty.
  if (merged.companyName === ticker && fresh.companyName) merged.companyName = fresh.companyName;

  if (filled.length > 0) {
    await db
      .from('instagram_posts')
      .update({ slides: { contentType: CONTENT_TYPE, data: merged } satisfies EarningsDeepDiveSlides })
      .eq('id', row.id);
  }

  return {
    attempted: true,
    filled,
    stillMissing: ESTIMATE_FIELDS.filter((k) => merged[k] == null),
  };
}

export async function writeHeadlineAndCaption(data: EarningsDeepDiveData): Promise<{ headline: string; caption: string }> {
  const spend = await checkAnthropicDailySpend();
  if (!spend.allowed) {
    return {
      headline: `${data.ticker} earnings are in`,
      caption: `${data.companyName} (${data.ticker}) just reported earnings. See the full breakdown on BullPen.`,
    };
  }

  const facts = [
    data.fiscalPeriodLabel ? `Fiscal period: ${data.fiscalPeriodLabel}` : null,
    `EPS: ${data.epsActual ?? 'N/A'} actual vs ${data.epsEstimate ?? 'N/A'} estimate (${data.epsStatus ?? 'unconfirmed'})`,
    data.epsAdjustmentNote ? `EPS note (mention this in the caption): the EPS actual ${data.epsAdjustmentNote}` : null,
    `Revenue: ${data.revenueActual ?? 'N/A'} actual vs ${data.revenueEstimate ?? 'N/A'} estimate (${data.revenueStatus ?? 'unconfirmed'}), YoY growth ${data.revenueYoyGrowthPercent ?? 'N/A'}%`,
    data.segmentLabel ? `${data.segmentLabel} revenue: ${data.segmentRevenueActual ?? 'N/A'}` : null,
    `Gross margin: ${data.grossMarginActualPercent ?? 'N/A'}% vs prior quarter ${data.grossMarginPriorQuarterPercent ?? 'N/A'}%`,
    data.guidanceRevenueLow != null && data.guidanceRevenueHigh != null
      ? `Next-quarter guidance: ${data.guidanceRevenueLow} to ${data.guidanceRevenueHigh}${data.guidanceConsensus != null ? ` vs ${data.guidanceConsensus} consensus` : ''}`
      : null,
    data.outlookNote ? `Full-year outlook${data.outlookDirection ? ` (${data.outlookDirection})` : ''}: ${data.outlookNote}` : null,
    data.keyMetricLabel ? `${data.keyMetricLabel}: ${data.keyMetricValueText}${data.keyMetricYoyPercent != null ? `, ${data.keyMetricYoyPercent}% YoY` : ''}` : null,
    data.storyPoints?.length ? `WHAT CHANGED, most market-moving first:\n${data.storyPoints.map((p) => `- ${p}`).join('\n')}` : null,
  ].filter(Boolean).join('\n');

  const systemPrompt = `You write short, punchy Instagram copy for BullPen, a financial app for beginner-to-intermediate investors.

Voice: confident, clear, never hype-y. No emoji spam (0-1 max, only if it genuinely fits). Never use an em dash (—) or en dash (–) to connect clauses; use a period or comma instead.

DATA FIDELITY (critical): you are given a real, fixed set of figures for one company's just-released earnings report. Use ONLY these figures and their already-computed beat/missed/in-line labels. Do not add, invent, or imply any other figure, and do not restate exact dollar numbers or percentages beyond what's given, since the slide images already show the exact figures.

WHAT TO LEAD WITH: a beat on its own is not news, about four in five companies beat every quarter, and stocks often fall after one. When a WHAT CHANGED list is given, the headline is about its FIRST item, not about beating or missing, and the caption explains that item before mentioning the beat or miss. Never call a report strong, great, or a win when the first WHAT CHANGED item is bad news. Never describe any figure as steady, holding, up, down, faster, or slower unless a WHAT CHANGED item says exactly that: a single number on its own has no trend. Only when no WHAT CHANGED list is given may the headline be about the beat or miss.

Output ONLY a JSON object with exactly two fields, nothing else, no markdown fences:
{"headline": "a punchy hook under 10 words capturing what changed", "caption": "a 2-4 sentence Instagram caption summarizing the report, ending with a soft call to action to see the full breakdown on BullPen"}`;

  const userPrompt = `${data.companyName} (${data.ticker}) reported earnings ${data.reportDate}.\n${facts}\n\nWrite the headline and caption now.`;

  const message = await getAnthropic().messages.create({
    model: MODEL,
    // Sonnet 5.5 can't turn thinking off; low effort keeps it short and it
    // counts toward max_tokens.
    max_tokens: 2000,
    output_config: { effort: 'low' },
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  void logAiCall({
    userId: null,
    feature: 'instagram_content',
    model: MODEL,
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
    metadata: { contentType: CONTENT_TYPE, step: 'headline_caption', ticker: data.ticker },
  });

  const textBlock = message.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('Claude returned no text content for earnings-deep-dive headline/caption');
  }
  const stripped = textBlock.text.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '');
  const jsonStr = stripped.match(/\{[\s\S]*\}/)?.[0] ?? stripped;
  const parsed = JSON.parse(jsonStr) as { headline: string; caption: string };

  return { headline: parsed.headline, caption: `${parsed.caption}\n\n${DEEP_DIVE_DISCLAIMER}\n\n${FIXED_HASHTAGS}` };
}

/**
 * The watcher's payoff function — called once lib/edgar/edgar-watch.ts finds
 * the earnings 8-K and fetches its press release text. Merges the extracted
 * actuals onto the draft row's pre-fetched estimates, computes every
 * beat/missed/in-line status, writes the headline/caption, flips the row to
 * 'ready', and posts the same Discord review notification every other
 * content type here posts. Returns the finished data for the caller to log/
 * print — the watcher script uses this for its own console output.
 */
export async function completeEarningsDeepDiveFromFiling(
  ticker: string,
  reportDate: string,
  extracted: ExtractedEarnings
): Promise<EarningsDeepDiveData> {
  const periodKey = periodKeyFor(ticker, reportDate);
  const supabase = createServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const { data: row } = (await db
    .from('instagram_posts')
    .select('id, status, slides')
    .eq('content_type', CONTENT_TYPE)
    .eq('period_key', periodKey)
    .maybeSingle()) as { data: InstagramPostRow | null };

  if (!row) {
    throw new Error(`No draft instagram_posts row found for ${periodKey} — call seedEarningsDeepDiveDraft first.`);
  }

  const draft = row.slides.data;

  // Non-GAAP preferred for both EPS and gross margin — see this module's
  // file header for why (matches what retail-facing consensus sources
  // quote for a company reporting both bases).
  const epsActual = extracted.epsActualNonGaap ?? extracted.epsActualGaap;
  const grossMarginActualPercent = extracted.grossMarginActualNonGaapPercent ?? extracted.grossMarginActualGaapPercent;

  const secondaryMetricLabel = extracted.freeCashFlow != null
    ? 'Free Cash Flow'
    : extracted.operatingMarginNonGaapPercent != null
      ? 'Operating Margin'
      : null;
  const secondaryMetricValue = extracted.freeCashFlow ?? extracted.operatingMarginNonGaapPercent ?? null;

  // Nasdaq's consensus for this report, so the EPS bars compare this quarter on
  // the same basis as their history. One free call; a miss just hides that row.
  const epsEstimateNasdaq = draft.epsEstimateNasdaq
    ?? (await fetchNasdaqEarningsDay(reportDate)).find((r) => r.symbol === ticker.toUpperCase())?.epsEstimate
    ?? null;

  const merged: EarningsDeepDiveData = {
    ...draft,
    epsEstimateNasdaq,
    companyName: extracted.companyName ?? draft.companyName,
    reportTiming: extracted.reportTiming ?? draft.reportTiming,
    fiscalPeriodLabel: extracted.fiscalPeriodLabel,
    epsActual,
    epsStatus: statusFor(draft.epsEstimate, epsActual),
    epsSurprisePercent: surprisePercent(draft.epsEstimate, epsActual),
    epsAdjustmentNote: extracted.epsActualNonGaap != null ? extracted.epsAdjustmentNote : null,
    revenueActual: extracted.revenueActual,
    revenueStatus: statusFor(draft.revenueEstimate, extracted.revenueActual),
    revenueYoyGrowthPercent: extracted.revenueYoyGrowthPercent,
    segmentRevenueActual: extracted.segmentRevenueActual,
    segmentYoyGrowthPercent: extracted.segmentYoyGrowthPercent,
    grossMarginActualPercent,
    secondaryMetricLabel,
    secondaryMetricValue,
    secondaryMetricIsCurrency: secondaryMetricLabel === 'Free Cash Flow',
    guidanceRevenueLow: extracted.guidanceRevenueLow,
    guidanceRevenueHigh: extracted.guidanceRevenueHigh,
    outlookDirection: extracted.outlookDirection,
    outlookNote: extracted.outlookNote,
    // Only against an actual on the same basis: GAAP guidance next to a non-GAAP
    // actual reads as a margin slip that is really the basis gap.
    grossMarginGuidancePercent: extracted.grossMarginGuidanceIsNonGaap === (extracted.grossMarginActualNonGaapPercent != null)
      ? extracted.grossMarginGuidancePercent
      : null,
    capexActual: extracted.capexActual,
    capexPriorYear: extracted.capexPriorYear,
    keyMetricLabel: extracted.keyMetricLabel,
    keyMetricValueText: extracted.keyMetricValueText,
    keyMetricYoyPercent: extracted.keyMetricYoyPercent,
  };

  merged.storyPoints = buildStoryPoints(merged);
  merged.whyThisMatters = merged.storyPoints.length > 0 ? merged.storyPoints.slice(0, 2).join(' ') : null;

  const { headline, caption } = await writeHeadlineAndCaption(merged);
  merged.headline = headline;
  merged.caption = caption;

  const finalSlides: EarningsDeepDiveSlides = { contentType: CONTENT_TYPE, data: merged };

  const { error: updateError } = await db
    .from('instagram_posts')
    .update({ status: 'ready', slides: finalSlides, caption })
    .eq('id', row.id);

  if (updateError) {
    throw new Error(`Failed to update earnings_deep_dive post ${row.id} to ready: ${updateError.message}`);
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || SITE_URL;
  const slideCount = totalSlideCount(finalSlides);

  // Dedicated deep-dive review channel takes priority over the general
  // Instagram content channel — falls back to the latter so this still
  // notifies somewhere if the dedicated webhook hasn't been configured yet.
  const webhookUrl = process.env.DISCORD_EARNINGS_DEEPDIVE_WEBHOOK_URL || process.env.DISCORD_INSTAGRAM_WEBHOOK_URL;
  if (webhookUrl) {
    // Row is already 'ready' (see the update above), so Discord's own
    // servers can fetch these render URLs and inline the actual slide
    // pictures — one embed per slide (each embed only carries one image;
    // multiple embeds in the same message is the standard way to paste
    // several images into one Discord post), not just a text link list.
    const summaryEmbed = {
      title: `${merged.ticker} earnings deep-dive ready for review`,
      description: `EPS ${merged.epsStatus ?? 'N/A'} · Revenue ${merged.revenueStatus ?? 'N/A'}\n\n**Caption:**\n${caption}`,
      color: merged.epsStatus === 'missed' ? 0xf87171 : 0x34d399,
      fields: [{ name: 'Publish', value: `\`npm run instagram-publish -- --id=${row.id}\`` }],
      timestamp: new Date().toISOString(),
    };
    // Summary card, the story slide when there's enough for one, then the
    // shared CTA slide (lib/instagram/render/slides.tsx) — 2 or 3, so loop.
    const slideEmbeds = Array.from({ length: slideCount }, (_, i) => ({
      image: { url: `${appUrl}/api/instagram/render/${row.id}/${i}` },
    }));

    await postToDiscord(webhookUrl, {
      content: `📊 **${merged.ticker} just reported.** Review below before publishing.`,
      embeds: [summaryEmbed, ...slideEmbeds],
    }).catch((err) => console.error('[earnings-deep-dive] Discord notification failed:', err));
  }

  return merged;
}
