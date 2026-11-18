/**
 * GET /api/stock/[ticker]/earnings-reaction
 *
 * How the stock has moved since its latest earnings release, for the price
 * slide of the earnings story: the last price against the last regular close
 * before the 8-K (lib/instagram/content/price-reaction.ts, the Instagram deep
 * dive's own reading). The release time comes from the stored recap, so only
 * reports a recap was written for have one. Free for everyone: it is price
 * data, not the Pro recap.
 *
 * One TwelveData call (1 credit), cached 5 minutes per report, and only within
 * STORY_DAYS of the report. A day after the release the read switches to
 * 5-minute bars so a week of trading still fits in one call.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withRateLimit, addSecurityHeaders, validateTickerParam } from '@/lib/security/api-security';
import { readRecap } from '@/lib/ai/earnings-recap';
import { readPriceReactionAsOf } from '@/lib/instagram/content/price-reaction';
import { rget, rset } from '@/lib/cache/redis-cache';
import { tryReserveOrganicCredits } from '@/lib/twelvedata/credit-budget';
import { TwelveDataRateLimitError } from '@/lib/twelvedata/twelvedata-client';
import { STORY_DAYS, type EarningsReaction } from '@/lib/earnings/story';

const TTL_SECONDS = 5 * 60;

async function handler(_request: NextRequest, context: unknown): Promise<NextResponse> {
  const { ticker } = await (context as { params: Promise<{ ticker: string }> }).params;
  const check = validateTickerParam(ticker);
  if (!check.valid || !check.normalized) {
    return addSecurityHeaders(NextResponse.json({ success: false, error: 'Invalid ticker' }, { status: 400 }));
  }
  const symbol = check.normalized;
  const none = () => addSecurityHeaders(NextResponse.json({ success: true, reaction: null }, { headers: { 'Cache-Control': 'public, s-maxage=300' } }));

  const recap = await readRecap(symbol);
  const releasedAt = recap?.filedAt ? Math.floor(Date.parse(recap.filedAt) / 1000) : NaN;
  const now = Math.floor(Date.now() / 1000);
  if (!recap || !Number.isFinite(releasedAt) || now - releasedAt > (STORY_DAYS + 1) * 86400) return none();

  const key = `earnings-reaction:${symbol}:${recap.accession}`;
  const cached = await rget<{ reaction: EarningsReaction | null }>(key);
  if (cached) return addSecurityHeaders(NextResponse.json({ success: true, reaction: cached.reaction }, { headers: { 'Cache-Control': 'public, s-maxage=60' } }));
  if (!(await tryReserveOrganicCredits(1))) return none();

  try {
    const r = await readPriceReactionAsOf(symbol, releasedAt, now, now - releasedAt > 86400 ? '5' : '1');
    const reaction = r ? { reportDate: recap.reportDate, changePercent: r.changePercent, asOf: r.asOf } : null;
    void rset(key, { reaction }, TTL_SECONDS);
    return addSecurityHeaders(NextResponse.json({ success: true, reaction }, { headers: { 'Cache-Control': 'public, s-maxage=60' } }));
  } catch (err) {
    // A 500 makes the client retry, which spends more credits against the same limit.
    if (err instanceof TwelveDataRateLimitError) return addSecurityHeaders(NextResponse.json({ success: true, reaction: null, error: 'plan_restricted' }));
    return none();
  }
}

export const GET = withRateLimit(handler, { windowMs: 60 * 1000, maxRequests: 60 });
