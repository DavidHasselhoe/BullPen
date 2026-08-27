/**
 * Market Movers content for the automated Instagram pipeline — today's top
 * 5 gainers and top 5 losers, restricted to the S&P 500 + Nasdaq 100
 * universe (SIGNIFICANT_TICKERS), NOT the broader INSTAGRAM_ALLOWLIST the
 * earnings posts use — a random small-cap's 100% pop isn't relevant to a
 * general audience the way a Nasdaq-100 name's 8% move is.
 *
 * WHICH stocks moved, and by how much, comes entirely from BullPen's own
 * TwelveData quotes (getStockQuotes's percent_change field) — never
 * web-searched or LLM-derived, unlike the earnings posts' report dates
 * (which BullPen doesn't own the data for). Company name + logo come from
 * attachCalendarMeta, the same cached screener_stats-backed lookup
 * earnings-calendar.ts uses.
 *
 * Always returns content — unlike the earnings generators, there is no
 * "quiet week, skip posting" case: with 518 tickers there's always a real
 * top 5/top 5 by rank.
 *
 * Claude never produces the ranking or the % numbers, only the caption
 * copy, grounded in the real list already computed above — same
 * "real data first, Claude only writes copy" rule as every other generator
 * in this pipeline.
 *
 * Claude cost: one short, non-web-search call (~$0.01/run) — see
 * lib/billing/log-ai-call.ts for where it's logged (feature:
 * 'instagram_content').
 */

import Anthropic from '@anthropic-ai/sdk';
import { getStockQuotes, withRateLimitRetry } from '@/lib/twelvedata/twelvedata-client';
import { waitForCronCreditBudget } from '@/lib/twelvedata/credit-budget';
import { SIGNIFICANT_TICKERS } from '@/lib/market-data/significant-tickers';
import { attachCalendarMeta } from '@/lib/market-data/calendar-market-cap';
import { getLogoManifest, logoUrlFromManifest } from '@/lib/logos/logo-manifest';
import { resolveAndPersistLogo, downloadAndValidateLogo } from '@/lib/logos/resolve-logo';
import { logAiCall } from '@/lib/billing/log-ai-call';
import { parseHookAndCaption } from './schema';
import { MARKET_DATA_DISCLAIMER, MARKET_DATA_DISCLAIMER_PRE_MARKET, FIXED_HASHTAGS, formatDateLabel } from './shared';
import type { MarketMoversSlides, MarketMoverEntry } from './schema';

const MODEL = 'claude-sonnet-4-6';
/** TwelveData /batch-safe chunk size — matches SEED_CHUNK in
 *  lib/market-data/seed-prices.ts and BATCH_CHUNK in
 *  app/api/quotes/batch/route.ts. */
const QUOTE_CHUNK_SIZE = 100;
const CREDITS_PER_QUOTE = 1;
const TOP_N = 10;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You write short, punchy Instagram copy for BullPen, a financial app for beginner-to-intermediate investors.

Voice: confident, clear, never hype-y. No emoji spam (0-1 max, only if it genuinely fits). Never use an em dash (—) or en dash (–) to connect clauses; use a period or comma instead.

DATA FIDELITY (critical): you are given today's real top 5 gainers and top 5 losers from the S&P 500 and Nasdaq 100. Use ONLY those company names, tickers, and % changes. Do not add, invent, or imply any other company or number, and do not speculate about WHY any INDIVIDUAL stock moved beyond what you're explicitly told. State only that it moved, unless a VERIFIED CONTEXT note below gives you a real, confirmed reason.

Output ONLY a JSON object with exactly two fields, nothing else, no markdown fences:
{
  "headline": "a punchy hook under 10 words, no ticker required",
  "caption": "a 2-3 sentence Instagram caption naming the day's single biggest gainer and biggest loser with their exact % change, ending with a soft call to action to check the full movers list on BullPen"
}`;

const PRE_MARKET_ADDENDUM = `\n\nThis is a special PRE-MARKET edition, posted before the US market opens. These are live pre-market price moves, not the regular post-close change — make that explicit in both the headline and caption (e.g. "before the bell", "pre-market"), so nobody mistakes this for the usual after-close movers post.`;

interface RankedQuote {
  symbol: string;
  changePercent: number;
  price: number;
}

interface MoverMetaInput {
  symbol: string;
  name?: string;
}

/**
 * Fetches a live quote for every S&P 500 + Nasdaq 100 ticker, chunked and
 * credit-budgeted the same way prefetch-market-data / screener-stats.ts /
 * calendar-days.ts do — 518 credits total exceeds CRON_CREDIT_SHARE (400)
 * in one unthrottled burst, so each 100-ticker chunk reserves before firing.
 * Sequential, not Promise.all, so chunks don't all queue on the shared
 * per-minute reservation counter simultaneously.
 */
async function fetchRankedQuotes(preMarket: boolean): Promise<RankedQuote[]> {
  const symbols = [...SIGNIFICANT_TICKERS];
  const ranked: RankedQuote[] = [];

  for (let i = 0; i < symbols.length; i += QUOTE_CHUNK_SIZE) {
    const chunk = symbols.slice(i, i + QUOTE_CHUNK_SIZE);
    await waitForCronCreditBudget(chunk.length * CREDITS_PER_QUOTE);
    try {
      // prepost:true is what makes this a genuine pre-market reading — without
      // it TwelveData's plain /quote returns yesterday's regular-session
      // close-to-close change, the same numbers the last post-close post
      // already used, not the actual pre-market move.
      const quotes = await withRateLimitRetry(() => getStockQuotes(chunk, { prepost: preMarket }));
      for (const [symbol, quote] of quotes.entries()) {
        if (!quote || quote.c <= 0 || !isFinite(quote.dp)) continue;
        ranked.push({ symbol, changePercent: quote.dp, price: quote.c });
      }
    } catch (err) {
      console.error(`[market-movers] quote chunk failed (${chunk[0]}..${chunk[chunk.length - 1]}):`, err);
      // Non-fatal — other chunks still contribute to the ranking.
    }
  }

  return ranked;
}

async function writeCaption(
  winners: MarketMoverEntry[],
  losers: MarketMoverEntry[],
  dateLabel: string,
  opts: { preMarket?: boolean; contextNote?: string } = {}
): Promise<string> {
  const listText = [
    'Winners:',
    ...winners.map((w) => `- ${w.symbol} (${w.name}): +${w.changePercent.toFixed(2)}%`),
    'Losers:',
    ...losers.map((l) => `- ${l.symbol} (${l.name}): ${l.changePercent.toFixed(2)}%`),
  ].join('\n');

  const sessionText = opts.preMarket ? "Today's S&P 500 + Nasdaq 100 pre-market movers" : "Today's S&P 500 + Nasdaq 100 movers";
  const contextText = opts.contextNote ? `\n\nVERIFIED CONTEXT (real, confirmed — you may reference this, nothing else): ${opts.contextNote}` : '';
  const userPrompt = `${dateLabel}. ${sessionText} (use ONLY these):\n${listText}${contextText}\n\nWrite the headline and caption now.`;

  const system = SYSTEM_PROMPT + (opts.preMarket ? PRE_MARKET_ADDENDUM : '');

  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 400,
    system,
    messages: [{ role: 'user', content: userPrompt }],
  });

  void logAiCall({
    userId: null,
    feature: 'instagram_content',
    model: MODEL,
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
    metadata: { contentType: 'market_movers', dateLabel, preMarket: opts.preMarket ?? false },
  });

  const textBlock = message.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('Claude returned no text content for market-movers caption');
  }

  // headline is intentionally discarded — market_movers has no hook slide
  // to put it on (see MarketMoversSlides), but the prompt still asks for
  // it to reuse the exact same HookAndCaptionSchema/parseHookAndCaption
  // every other generator in this pipeline already validates against,
  // rather than adding a second near-duplicate schema for one field.
  const { caption } = parseHookAndCaption(textBlock.text);
  const disclaimer = opts.preMarket ? MARKET_DATA_DISCLAIMER_PRE_MARKET : MARKET_DATA_DISCLAIMER;
  return `${caption}\n\n${disclaimer}\n\n${FIXED_HASHTAGS}`;
}

/**
 * Backfills any of today's mover tickers whose logo is missing OR broken —
 * `attachCalendarMeta`'s logo lookup only serves whatever's already present
 * in the `company-logos` bucket manifest (see logo-manifest.ts), and merely
 * being *present* isn't proof it's a real, renderable image: root cause of
 * the 2026-08-26 $LITE/$WMB missing-logo incident was a stale/invalid object
 * from before this pipeline's validation existed (confirmed via storage
 * timestamps: `lite.jpg`/`wmb.jpg` — the extension `getStorageLogoUrl`'s
 * older, unvalidated convention writes — were replaced by freshly-validated
 * `lite.png`/`wmb.png` a few hours AFTER that day's post had already
 * generated and baked the dead `.jpg` URL into its static slide JSON, which
 * never gets re-derived once staged. So "present in the manifest" alone
 * isn't enough to trust — this validates the actual bytes the same way
 * `resolveAndPersistLogo` does before ever accepting a URL as good.
 *
 * Only ~20 tickers ever appear in one post, so validating (a fast read of
 * our own storage CDN, no external credits) and backfilling any failures via
 * TwelveData/logo.dev (1 credit each, only on a real miss) is cheap
 * insurance against ever shipping a blank or broken logo for a stock that
 * was genuinely rankable today.
 */
async function backfillMissingLogos(symbols: string[]): Promise<Map<string, string>> {
  const manifest = await getLogoManifest();
  const backfilled = new Map<string, string>();

  const needsResolve: string[] = [];
  await Promise.all(
    symbols.map(async (sym) => {
      const candidate = logoUrlFromManifest(manifest, sym);
      if (!candidate) {
        needsResolve.push(sym);
        return;
      }
      const valid = await downloadAndValidateLogo(candidate).catch(() => null);
      if (!valid) needsResolve.push(sym);
    })
  );

  if (needsResolve.length === 0) return backfilled;

  // Sequential: each resolution is a real external fetch (TwelveData, then
  // logo.dev) plus a storage upload, not a cheap read — no need to
  // parallelize a handful of misses, and it keeps failures isolated per ticker.
  for (const sym of needsResolve) {
    try {
      const result = await resolveAndPersistLogo(sym);
      if (result.success && result.url) backfilled.set(sym, result.url);
    } catch (err) {
      console.error(`[market-movers] logo backfill failed for ${sym}:`, err);
    }
  }
  return backfilled;
}

export interface GenerateMarketMoversOptions {
  /** Off-schedule special edition using live pre-market quotes instead of the
   *  regular post-close change — see PRE_MARKET_ADDENDUM and fetchRankedQuotes. */
  preMarket?: boolean;
  /** A real, confirmed fact (e.g. "$NVDA reported earnings after yesterday's
   *  close") the caption is allowed to reference as macro context. Never
   *  invented by this function — the caller supplies it, and the system
   *  prompt still forbids Claude from speculating about any OTHER stock's
   *  move beyond what's in this note. */
  contextNote?: string;
}

/**
 * Builds the full slide content for today's Market Movers carousel. Real
 * data first, Claude second, grounded in that data — see file header.
 */
export async function generateMarketMoversContent(
  dateET: string,
  opts: GenerateMarketMoversOptions = {}
): Promise<MarketMoversSlides> {
  const { preMarket = false, contextNote } = opts;
  const ranked = await fetchRankedQuotes(preMarket);

  const winnersRanked = [...ranked].sort((a, b) => b.changePercent - a.changePercent).slice(0, TOP_N);
  const losersRanked = [...ranked].sort((a, b) => a.changePercent - b.changePercent).slice(0, TOP_N);

  const backfilledLogos = await backfillMissingLogos(
    [...winnersRanked, ...losersRanked].map((r) => r.symbol)
  );

  const winnersInput: MoverMetaInput[] = winnersRanked.map((r) => ({ symbol: r.symbol }));
  const losersInput: MoverMetaInput[] = losersRanked.map((r) => ({ symbol: r.symbol }));
  const [winnersMeta, losersMeta] = await Promise.all([
    attachCalendarMeta(winnersInput),
    attachCalendarMeta(losersInput),
  ]);

  const toEntry = (r: RankedQuote, meta: MoverMetaInput & { logo_url: string | null }): MarketMoverEntry => ({
    symbol: r.symbol,
    name: meta.name ?? r.symbol,
    changePercent: r.changePercent,
    price: r.price,
    logoUrl: backfilledLogos.get(r.symbol) ?? meta.logo_url,
  });

  const winners = winnersRanked.map((r, i) => toEntry(r, winnersMeta[i]));
  const losers = losersRanked.map((r, i) => toEntry(r, losersMeta[i]));

  const dateLabel = formatDateLabel(dateET);
  const caption = await writeCaption(winners, losers, dateLabel, { preMarket, contextNote });

  return {
    contentType: 'market_movers',
    dateLabel,
    sessionLabel: preMarket ? 'Pre-Market' : undefined,
    winners,
    losers,
    caption,
  };
}
