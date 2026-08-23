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
import { logAiCall } from '@/lib/billing/log-ai-call';
import { parseHookAndCaption } from './schema';
import { MARKET_DATA_DISCLAIMER, FIXED_HASHTAGS, formatDateLabel } from './shared';
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

DATA FIDELITY (critical): you are given today's real top 5 gainers and top 5 losers from the S&P 500 and Nasdaq 100. Use ONLY those company names, tickers, and % changes. Do not add, invent, or imply any other company or number, and do not speculate about WHY any stock moved. State only that it moved.

Output ONLY a JSON object with exactly two fields, nothing else, no markdown fences:
{
  "headline": "a punchy hook under 10 words, no ticker required",
  "caption": "a 2-3 sentence Instagram caption naming the day's single biggest gainer and biggest loser with their exact % change, ending with a soft call to action to check the full movers list on BullPen"
}`;

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
async function fetchRankedQuotes(): Promise<RankedQuote[]> {
  const symbols = [...SIGNIFICANT_TICKERS];
  const ranked: RankedQuote[] = [];

  for (let i = 0; i < symbols.length; i += QUOTE_CHUNK_SIZE) {
    const chunk = symbols.slice(i, i + QUOTE_CHUNK_SIZE);
    await waitForCronCreditBudget(chunk.length * CREDITS_PER_QUOTE);
    try {
      const quotes = await withRateLimitRetry(() => getStockQuotes(chunk));
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
  dateLabel: string
): Promise<string> {
  const listText = [
    'Winners:',
    ...winners.map((w) => `- ${w.symbol} (${w.name}): +${w.changePercent.toFixed(2)}%`),
    'Losers:',
    ...losers.map((l) => `- ${l.symbol} (${l.name}): ${l.changePercent.toFixed(2)}%`),
  ].join('\n');

  const userPrompt = `${dateLabel}. Today's S&P 500 + Nasdaq 100 movers (use ONLY these):\n${listText}\n\nWrite the headline and caption now.`;

  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 400,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  });

  void logAiCall({
    userId: null,
    feature: 'instagram_content',
    model: MODEL,
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
    metadata: { contentType: 'market_movers', dateLabel },
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
  return `${caption}\n\n${MARKET_DATA_DISCLAIMER}\n\n${FIXED_HASHTAGS}`;
}

/**
 * Builds the full slide content for today's Market Movers carousel. Real
 * data first, Claude second, grounded in that data — see file header.
 */
export async function generateMarketMoversContent(dateET: string): Promise<MarketMoversSlides> {
  const ranked = await fetchRankedQuotes();

  const winnersRanked = [...ranked].sort((a, b) => b.changePercent - a.changePercent).slice(0, TOP_N);
  const losersRanked = [...ranked].sort((a, b) => a.changePercent - b.changePercent).slice(0, TOP_N);

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
    logoUrl: meta.logo_url,
  });

  const winners = winnersRanked.map((r, i) => toEntry(r, winnersMeta[i]));
  const losers = losersRanked.map((r, i) => toEntry(r, losersMeta[i]));

  const dateLabel = formatDateLabel(dateET);
  const caption = await writeCaption(winners, losers, dateLabel);

  return {
    contentType: 'market_movers',
    dateLabel,
    winners,
    losers,
    caption,
  };
}
