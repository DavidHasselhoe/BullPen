/**
 * GET /api/asset/[slug]/commodity
 *
 * Everything a commodity page shows beyond the price panel: how to own it
 * (funds and producers, with today's move), its sibling commodities, the
 * year's range and long-run returns against the S&P 500, and the gold/silver
 * ratio or the Brent-WTI spread.
 *
 * Credits: quotes are one batch for the stocks and funds (prepost outside the
 * regular session, so a fund's "today" matches Holdings) and one for the spot
 * pairs, cached a minute. History is weekly bars for the commodity, SPY and,
 * on metal pages, XAU/XAG, cached 12 hours: 1 credit each.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withRateLimit, addSecurityHeaders } from '@/lib/security/api-security';
import {
  getStockQuotes,
  getStockCandles,
  isOutsideRegularSessionET,
  TwelveDataRateLimitError,
} from '@/lib/twelvedata/twelvedata-client';
import { COMMODITIES, findCommodity } from '@/lib/assets/asset-type';
import { getCached, setCached } from '@/lib/cache/market-data-cache';
import { rget, rset } from '@/lib/cache/redis-cache';

const QUOTES_TTL_S = 60;
const HISTORY_TTL_S = 12 * 60 * 60;
const YEAR_S = 365.25 * 24 * 60 * 60;

interface Quote { ticker: string; price: number; changePct: number }

export interface CommodityHistory {
  high52: number;
  low52: number;
  /** Price change over the window, in percent, for the commodity and SPY. Null when the series is shorter. */
  returns: { years: 1 | 5 | 10; asset: number | null; sp500: number | null }[];
  /** Gold/silver ratio's 10-year weekly average, metal pages only. */
  ratioAvg10y: number | null;
}

export interface CommodityData {
  own: Quote[];
  peers: Quote[];
  /** Ounces of silver one ounce of gold buys (metals), or Brent minus WTI in dollars (oil). */
  ratio: number | null;
  spread: number | null;
  history: CommodityHistory | null;
}

/** Percent change from the last close at or before `yearsAgo` to the latest close. */
function returnOver(t: number[], c: number[], yearsAgo: number): number | null {
  if (t.length < 2) return null;
  const target = t[t.length - 1] - yearsAgo * YEAR_S;
  if (t[0] > target + 14 * 24 * 60 * 60) return null; // series starts after the window
  let i = 0;
  while (i + 1 < t.length && t[i + 1] <= target) i++;
  return c[i] > 0 ? ((c[c.length - 1] - c[i]) / c[i]) * 100 : null;
}

async function loadHistory(symbol: string, withRatio: boolean): Promise<CommodityHistory | null> {
  const key = `commodity-history:${symbol}`;
  const cached = await getCached<CommodityHistory>(key);
  if (cached) return cached;

  const now = Math.floor(Date.now() / 1000);
  const from = now - Math.ceil(10.2 * YEAR_S);
  const [asset, spy, ratio] = await Promise.all([
    getStockCandles(symbol, from, now, 'W'),
    getStockCandles('SPY', from, now, 'W'),
    withRatio ? getStockCandles('XAU/XAG', from, now, 'W') : Promise.resolve(null),
  ]);
  if (asset.t.length < 2) return null;

  // The last 52 weekly bars cover the year; their highs and lows are the year's extremes.
  const yearStart = Math.max(0, asset.t.length - 52);
  const history: CommodityHistory = {
    high52: Math.max(...asset.h.slice(yearStart)),
    low52: Math.min(...asset.l.slice(yearStart)),
    returns: ([1, 5, 10] as const).map((years) => ({
      years,
      asset: returnOver(asset.t, asset.c, years),
      sp500: returnOver(spy.t, spy.c, years),
    })),
    ratioAvg10y: ratio && ratio.c.length > 0 ? ratio.c.reduce((a, b) => a + b, 0) / ratio.c.length : null,
  };
  void setCached(key, symbol, 'commodity-history', history, HISTORY_TTL_S);
  return history;
}

async function loadQuotes(commodity: (typeof COMMODITIES)[number]) {
  const key = `commodity-quotes:${commodity.ticker}`;
  const cached = await rget<Pick<CommodityData, 'own' | 'peers' | 'ratio' | 'spread'>>(key);
  if (cached) return cached;

  const peers = COMMODITIES.filter((c) => c.group === commodity.group && c.ticker !== commodity.ticker).map((c) => c.ticker);
  const pairs = commodity.group === 'metal' ? [...peers, 'XAU/XAG'] : [...peers, commodity.ticker];
  const [stocks, spot] = await Promise.all([
    getStockQuotes(commodity.own.map((o) => o.ticker), { prepost: isOutsideRegularSessionET() }),
    getStockQuotes(pairs),
  ]);
  const quote = (ticker: string, q?: { c: number; dp: number }): Quote | null =>
    q && q.c > 0 ? { ticker, price: q.c, changePct: q.dp } : null;

  const brent = spot.get('XBR/USD')?.c;
  const wti = spot.get('WTI/USD')?.c;
  const out = {
    own: commodity.own.map((o) => quote(o.ticker, stocks.get(o.ticker))).filter((q): q is Quote => q != null),
    peers: peers.map((t) => quote(t, spot.get(t))).filter((q): q is Quote => q != null),
    ratio: commodity.group === 'metal' ? spot.get('XAU/XAG')?.c ?? null : null,
    spread: brent && wti ? brent - wti : null,
  };
  void rset(key, out, QUOTES_TTL_S);
  return out;
}

async function handler(_req: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const commodity = findCommodity(slug);
  if (!commodity) {
    return addSecurityHeaders(NextResponse.json({ success: false, error: 'not_a_commodity' }, { status: 404 }));
  }

  try {
    // History failing (a slow upstream) still leaves the quotes worth showing.
    const [quotes, history] = await Promise.all([
      loadQuotes(commodity),
      loadHistory(commodity.ticker, commodity.group === 'metal').catch((err) => {
        if (err instanceof TwelveDataRateLimitError) throw err;
        console.error(`[commodity] history failed for ${commodity.ticker}:`, err);
        return null;
      }),
    ]);
    const data: CommodityData = { ...quotes, history };
    return addSecurityHeaders(
      NextResponse.json({ success: true, data }, { headers: { 'Cache-Control': 'private, max-age=60' } })
    );
  } catch (err) {
    if (err instanceof TwelveDataRateLimitError) {
      return addSecurityHeaders(NextResponse.json({ success: false, error: 'plan_restricted' }, { status: 200 }));
    }
    console.error(`[commodity] failed for ${commodity.ticker}:`, err);
    return addSecurityHeaders(NextResponse.json({ success: false, error: 'Failed to load' }, { status: 500 }));
  }
}

export const GET = withRateLimit(handler, { windowMs: 60_000, maxRequests: 60 });
