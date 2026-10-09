/**
 * Weekly Pick scoreboard post: the picks' track record against the S&P 500.
 *
 * Every number comes from computePerformance() (lib/picks/performance.ts),
 * the same maths the /picks page shows: $100 into each pick at the first open
 * on or after its pick date, and $100 into SPY on the same days. Nothing here
 * can drop a pick; a losing week is posted like a winning one (the cron runs
 * regardless of the result).
 *
 * Claude writes only the caption and one "what moved it" line each for the
 * best and worst pick, from a short web search. COST: one call, up to 4
 * searches on web_search_20250305 (the cheaper tool for short answers, see
 * lib/ai/why-today.ts), roughly $0.05-0.15 a week. Skipped when the daily
 * Anthropic spend cap is hit; the post then goes out with a plain caption.
 */

import Anthropic from '@anthropic-ai/sdk';
import { computePerformance } from '@/lib/picks/performance';
import { createServerClient } from '@/lib/supabase/client';
import { logAiCall } from '@/lib/billing/log-ai-call';
import { checkAnthropicDailySpend } from '@/lib/billing/anthropic-spend-guard';
import { displayCompanyName } from '@/lib/market-data/company-name';
import { getDisplayNames } from '@/lib/market-data/display-names';
import { fmtShortDate, todayET } from '@/lib/dates/calendar-format';
import { formatDateLabel, resolveLogoUrl } from './shared';
import { SITE_URL } from '@/lib/site';
import type { PicksScoreboardSlides, ScoreboardCallout, ScoreboardPick } from './schema';
import type { PickWithPerformance } from '@/lib/picks/types';

const MODEL = 'claude-sonnet-5';

/** On the slide as well as in the caption: a performance claim for a paid product is advertising. */
export const SCOREBOARD_DISCLAIMER =
  'Hypothetical returns: each pick bought at the open on its pick day, no fees or taxes. ' +
  'The S&P 500 figure is SPY bought on the same days. Past performance does not predict future results. Not investment advice.';

const HASHTAGS = '#StockMarket #Investing #StockPicks #SP500 #InvestingForBeginners';

/** Model-written lines on the slide are never cut, so one that won't fit is dropped instead. */
const MAX_WHY_CHARS = 220;

const pct = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;

/** Em and en dashes out of user-facing copy (CLAUDE.md), however the model phrased it. */
const undash = (s: string) => s.replace(/\s*[—–]\s*/g, ', ').trim();

function toPick(p: PickWithPerformance, names: Map<string, string>): ScoreboardPick {
  // The app's short name first: ai_stock_picks.company_name is sometimes just
  // the ticker (CRM) or carries share-class wording.
  const stored = p.companyName && p.companyName.toUpperCase() !== p.symbol ? displayCompanyName(p.companyName) : null;
  return {
    symbol: p.symbol,
    name: names.get(p.symbol.toUpperCase()) ?? stored ?? p.symbol,
    logoUrl: p.logoUrl,
    pickDate: p.pickDate,
    returnPct: p.returnPct as number,
    benchmarkReturnPct: p.benchmarkReturnPct as number,
  };
}

/** The lead in the last published scoreboard, for "this week +0.4 pts". */
async function previousLead(): Promise<number | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createServerClient() as any; // instagram_posts isn't in the generated Database type yet
  const { data } = await db
    .from('instagram_posts')
    .select('slides')
    .eq('content_type', 'picks_scoreboard')
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const s = data?.slides as PicksScoreboardSlides | undefined;
  return s ? s.totalReturnPct - s.benchmarkReturnPct : null;
}

interface WrittenCopy { bestWhy: string | null; worstWhy: string | null; caption: string | null }

async function writeCopy(c: Omit<PicksScoreboardSlides, 'caption'>, why: { best: string; worst: string }): Promise<WrittenCopy> {
  const none = { bestWhy: null, worstWhy: null, caption: null };
  const spend = await checkAnthropicDailySpend();
  if (!spend.allowed) {
    console.error(`[picks-scoreboard] AI copy skipped: Anthropic spend cap reached ($${spend.spentTodayUsd.toFixed(2)})`);
    return none;
  }
  const lead = c.totalReturnPct - c.benchmarkReturnPct;
  const facts = [
    `Track record since ${c.sinceLabel}, ${c.pickCount} weekly picks. Combined return of $100 put into each pick at its first open: ${pct(c.totalReturnPct)}. ` +
      `$100 into SPY (the S&P 500) on the same days: ${pct(c.benchmarkReturnPct)}. That is ${Math.abs(lead).toFixed(1)} points ${lead >= 0 ? 'ahead' : 'behind'}.`,
    c.weekChangePts != null ? `Change in the lead since last week's post: ${c.weekChangePts >= 0 ? '+' : ''}${c.weekChangePts.toFixed(1)} points.` : 'This is the first scoreboard post.',
    `${c.beatCount} of ${c.pickCount} picks are ahead of the S&P 500 over their own holding period.`,
    `Biggest winner: ${c.best.name} ($${c.best.symbol}), picked ${c.best.pickDate}, ${pct(c.best.returnPct)} vs S&P ${pct(c.best.benchmarkReturnPct)}. Picked for: ${why.best}`,
    `Biggest loser: ${c.worst.name} ($${c.worst.symbol}), picked ${c.worst.pickDate}, ${pct(c.worst.returnPct)} vs S&P ${pct(c.worst.benchmarkReturnPct)}. Picked for: ${why.worst}`,
  ].join('\n');

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const res = await anthropic.beta.messages.create({
    model: MODEL,
    max_tokens: 900,
    thinking: { type: 'disabled' },
    betas: ['web-search-2025-03-05'],
    tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 4 }],
    system:
      'You write for BullPen, an investing app for beginners, about its own Weekly Pick track record. ' +
      'Search the news for what moved the biggest winner and the biggest loser since their pick dates, then answer. ' +
      'Write nothing before your searches are done. Use only the numbers given and what you find; never invent a cause. ' +
      'If no news explains a move, say what it moved with instead (its sector, the market, earnings) only if you found that. ' +
      'Plain, calm language a beginner understands. No hype, no predictions, no advice, no emojis. ' +
      'The headline figure is the combined return of all picks together; never say every pick is up or call it an average, since some picks are down. ' +
      'Never use an em dash or en dash to connect clauses; use a period or comma. ' +
      'Output ONLY JSON, no fences: {"bestWhy": "...", "worstWhy": "...", "caption": "..."} where ' +
      'bestWhy and worstWhy are one sentence each, 25 words at most, leading with the cause (the reader already sees the ticker and percent), ' +
      'and caption is 3-5 short sentences: the score against the S&P 500 and this week\'s change, then what drove the biggest winner and the biggest loser and why each was picked, ' +
      'ending with "Every pick and the full track record are on BullPen, link in bio." Be honest about the loser and about a week where the lead shrank.',
    messages: [{ role: 'user', content: `Today is ${todayET()}.\n${facts}` }],
  });

  void logAiCall({
    userId: null,
    feature: 'instagram_content',
    model: MODEL,
    inputTokens: res.usage.input_tokens,
    outputTokens: res.usage.output_tokens,
    webSearches: res.usage.server_tool_use?.web_search_requests ?? 0,
    metadata: { contentType: 'picks_scoreboard' },
  });

  const lastSearch = res.content.findLastIndex((b) => b.type === 'web_search_tool_result');
  const text = res.content.slice(lastSearch + 1).map((b) => (b.type === 'text' ? b.text : '')).join('').trim();
  try {
    const j = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? '') as Record<string, unknown>;
    const why = (v: unknown) => (typeof v === 'string' && v.trim() && v.length <= MAX_WHY_CHARS ? undash(v) : null);
    return {
      bestWhy: why(j.bestWhy),
      worstWhy: why(j.worstWhy),
      caption: typeof j.caption === 'string' && j.caption.trim() ? undash(j.caption) : null,
    };
  } catch {
    console.error('[picks-scoreboard] could not parse model copy:', text.slice(0, 300));
    return none;
  }
}

function plainCaption(c: Omit<PicksScoreboardSlides, 'caption'>): string {
  const lead = c.totalReturnPct - c.benchmarkReturnPct;
  return (
    `Our Weekly Pick track record since ${c.sinceLabel}: ${pct(c.totalReturnPct)} across ${c.pickCount} picks, ` +
    `against ${pct(c.benchmarkReturnPct)} for the S&P 500 on the same days. That is ${Math.abs(lead).toFixed(1)} points ${lead >= 0 ? 'ahead' : 'behind'}. ` +
    `Best so far: ${c.best.name}, ${pct(c.best.returnPct)}. Worst: ${c.worst.name}, ${pct(c.worst.returnPct)}. ` +
    'Every pick and the full track record are on BullPen, link in bio.'
  );
}

export async function generatePicksScoreboardContent(): Promise<PicksScoreboardSlides> {
  const perf = await computePerformance();
  const { summary } = perf;
  if (summary.insufficientSample || summary.totalReturnPct == null || summary.benchmarkReturnPct == null || !summary.trackingSince) {
    // The /picks page withholds the headline below MIN_PICKS_FOR_HEADLINE; so does the post.
    throw new Error('insufficient_sample');
  }

  const tracked = perf.picks
    .filter((p) => p.returnPct != null && p.benchmarkReturnPct != null)
    .sort((a, b) => b.pickDate.localeCompare(a.pickDate));
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || SITE_URL;
  await Promise.all(tracked.map(async (p) => { p.logoUrl ??= await resolveLogoUrl(appUrl, p.symbol); }));

  const names = await getDisplayNames(tracked.map((p) => p.symbol));
  const byReturn = [...tracked].sort((a, b) => (b.returnPct as number) - (a.returnPct as number));
  // The pick's headline on the slide (one line, 60-75 chars); the longer
  // oneLiner only feeds the caption prompt, where there's room for it.
  const callout = (p: PickWithPerformance): ScoreboardCallout & { oneLiner: string } => ({
    ...toPick(p, names), pickedFor: undash(p.headline), movedBy: null, oneLiner: p.oneLiner,
  });
  const best = callout(byReturn[0]);
  const worst = callout(byReturn[byReturn.length - 1]);

  const prev = await previousLead();
  const lead = summary.totalReturnPct - summary.benchmarkReturnPct;
  const base: Omit<PicksScoreboardSlides, 'caption'> = {
    contentType: 'picks_scoreboard',
    asOfLabel: formatDateLabel(todayET()),
    sinceLabel: fmtShortDate(summary.trackingSince),
    pickCount: tracked.length,
    totalReturnPct: summary.totalReturnPct,
    benchmarkReturnPct: summary.benchmarkReturnPct,
    weekChangePts: prev == null ? null : lead - prev,
    beatCount: tracked.filter((p) => (p.returnPct as number) > (p.benchmarkReturnPct as number)).length,
    picks: tracked.map((p) => toPick(p, names)),
    best: (({ oneLiner: _o, ...c }) => c)(best),
    worst: (({ oneLiner: _o, ...c }) => c)(worst),
  };

  const copy = await writeCopy(base, { best: best.oneLiner, worst: worst.oneLiner });
  base.best.movedBy = copy.bestWhy;
  base.worst.movedBy = copy.worstWhy;
  const caption = `${copy.caption ?? plainCaption(base)}\n\n${SCOREBOARD_DISCLAIMER}\n\n${HASHTAGS}`;
  return { ...base, caption };
}
