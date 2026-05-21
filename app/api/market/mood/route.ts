/**
 * GET /api/market/mood
 *
 * Returns a composite Fear & Greed score (0–100) derived from 4 signals:
 *   1. VIX (market volatility)         — 35% weight
 *   2. S&P 500 momentum (vs 125d SMA)  — 30% weight
 *   3. Junk bond demand (HYG vs LQD)   — 20% weight
 *   4. Safe haven demand (SPY vs TLT)  — 15% weight
 *
 * CDN-cached for 15 minutes — no auth required.
 */

import { NextResponse } from 'next/server';
import { withRateLimit, addSecurityHeaders } from '@/lib/security/api-security';
import { getStockQuotes, getIndicator } from '@/lib/twelvedata/twelvedata-client';

export interface MoodSignal {
  name: string;
  score: number;
  label: string;
  detail: string;
  raw: Record<string, number>;
}

export interface MarketMoodData {
  composite: number;
  label: string;
  signals: MoodSignal[];
  generatedAt: string;
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function scoreToLabel(s: number): string {
  if (s <= 20) return 'Extreme Fear';
  if (s <= 40) return 'Fear';
  if (s <= 60) return 'Neutral';
  if (s <= 80) return 'Greed';
  return 'Extreme Greed';
}

// Low VIX = complacency/greed, High VIX = panic/fear
function vixToScore(vix: number): number {
  return Math.round(clamp(95 - 3.2 * (vix - 10), 5, 95));
}

// SPY above 125d SMA = bullish momentum, below = bearish
function momentumToScore(pctFromSma: number): number {
  return Math.round(clamp(50 + pctFromSma * 5, 5, 95));
}

// HYG (high yield) outperforming LQD (investment grade) = risk appetite
function bondSpreadToScore(hygDp: number, lqdDp: number): number {
  const spread = hygDp - lqdDp;
  return Math.round(clamp(50 + spread * 35, 5, 95));
}

// SPY outperforming TLT = risk-on, TLT outperforming SPY = flight to safety
function safeHavenToScore(spyDp: number, tltDp: number): number {
  const divergence = spyDp - tltDp;
  return Math.round(clamp(50 + divergence * 18, 5, 95));
}

async function handler(): Promise<NextResponse> {
  const [quotesMap, smaResult] = await Promise.allSettled([
    getStockQuotes(['VIX', 'SPY', 'HYG', 'LQD', 'TLT']),
    getIndicator('SPY', 'sma', { interval: '1day', time_period: 125, outputsize: 5 }),
  ]);

  if (quotesMap.status === 'rejected') {
    console.error('[market/mood] quotes failed:', quotesMap.reason);
    return NextResponse.json({ error: 'Failed to fetch market data' }, { status: 503 });
  }

  const quotes = quotesMap.value;
  const vixQ  = quotes.get('VIX');
  const spyQ  = quotes.get('SPY');
  const hygQ  = quotes.get('HYG');
  const lqdQ  = quotes.get('LQD');
  const tltQ  = quotes.get('TLT');

  if (!vixQ || !spyQ || !hygQ || !lqdQ || !tltQ) {
    return NextResponse.json({ error: 'Incomplete market data' }, { status: 503 });
  }

  // SMA is best-effort — fall back to neutral if unavailable
  let smaValue: number | null = null;
  if (smaResult.status === 'fulfilled' && smaResult.value.values.length > 0) {
    const raw = smaResult.value.values[0].sma;
    smaValue = typeof raw === 'number' ? raw : null;
  }

  const momentumPct = smaValue ? ((spyQ.c - smaValue) / smaValue) * 100 : 0;
  const momentumScore = smaValue ? momentumToScore(momentumPct) : 50;

  const signals: MoodSignal[] = [
    {
      name: 'Market Volatility',
      score: vixToScore(vixQ.c),
      label: scoreToLabel(vixToScore(vixQ.c)),
      detail: `VIX at ${vixQ.c.toFixed(2)} (${vixQ.dp >= 0 ? '+' : ''}${vixQ.dp.toFixed(1)}% today) — ${vixQ.c < 15 ? 'low volatility, investors are complacent' : vixQ.c < 25 ? 'moderate market uncertainty' : 'elevated fear and risk aversion'}`,
      raw: { vix: vixQ.c, change: vixQ.dp },
    },
    {
      name: 'S&P 500 Momentum',
      score: momentumScore,
      label: scoreToLabel(momentumScore),
      detail: smaValue
        ? `SPY $${spyQ.c.toFixed(2)} is ${momentumPct >= 0 ? '+' : ''}${momentumPct.toFixed(1)}% ${momentumPct >= 0 ? 'above' : 'below'} its 125-day moving average — ${momentumPct > 5 ? 'strong bullish trend' : momentumPct > 0 ? 'mild bullish bias' : momentumPct > -5 ? 'mild bearish pressure' : 'bearish momentum'}`
        : `SPY at $${spyQ.c.toFixed(2)} (125-day SMA unavailable)`,
      raw: { price: spyQ.c, sma125: smaValue ?? 0, pctFromSma: momentumPct },
    },
    {
      name: 'Junk Bond Demand',
      score: bondSpreadToScore(hygQ.dp, lqdQ.dp),
      label: scoreToLabel(bondSpreadToScore(hygQ.dp, lqdQ.dp)),
      detail: `HYG ${hygQ.dp >= 0 ? '+' : ''}${hygQ.dp.toFixed(2)}% vs LQD ${lqdQ.dp >= 0 ? '+' : ''}${lqdQ.dp.toFixed(2)}% — ${hygQ.dp > lqdQ.dp ? 'investors chasing yield signals risk appetite' : 'flight to quality bonds signals caution'}`,
      raw: { hyg: hygQ.dp, lqd: lqdQ.dp, spread: hygQ.dp - lqdQ.dp },
    },
    {
      name: 'Safe Haven Demand',
      score: safeHavenToScore(spyQ.dp, tltQ.dp),
      label: scoreToLabel(safeHavenToScore(spyQ.dp, tltQ.dp)),
      detail: `SPY ${spyQ.dp >= 0 ? '+' : ''}${spyQ.dp.toFixed(2)}% vs TLT ${tltQ.dp >= 0 ? '+' : ''}${tltQ.dp.toFixed(2)}% — ${spyQ.dp > tltQ.dp ? 'equities outperforming treasuries, risk-on sentiment' : 'treasuries outperforming equities, defensive positioning'}`,
      raw: { spy: spyQ.dp, tlt: tltQ.dp, divergence: spyQ.dp - tltQ.dp },
    },
  ];

  // Weighted composite: VIX 35%, Momentum 30%, Bond Spread 20%, Safe Haven 15%
  const weights = [0.35, 0.30, 0.20, 0.15];
  const composite = Math.round(
    signals.reduce((sum, s, i) => sum + s.score * weights[i], 0)
  );

  const data: MarketMoodData = {
    composite,
    label: scoreToLabel(composite),
    signals,
    generatedAt: new Date().toISOString(),
  };

  return addSecurityHeaders(
    NextResponse.json(data, {
      headers: {
        'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=300',
      },
    })
  );
}

export const GET = withRateLimit(handler, { windowMs: 60_000, maxRequests: 20 });
