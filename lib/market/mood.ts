/**
 * Composite market mood score (0–100) derived from 4 signals, all read from
 * daily closes so one big day can't swing the whole score:
 *   1. Market volatility (SPY 20-day realized volatility) — 35% weight
 *   2. S&P 500 momentum (SPY vs its 125-day average)       — 30% weight
 *   3. Junk bond demand (HYG vs LQD, 20-day return)        — 20% weight
 *   4. Safe haven demand (SPY vs TLT, 20-day return)       — 15% weight
 *
 * VIX itself isn't on our TwelveData plan (indices aren't covered), so the
 * volatility signal measures how much SPY has actually been swinging instead.
 *
 * Shared by GET /api/market/mood and the Daily Brief cron.
 */

import { getStockCandles } from '@/lib/twelvedata/twelvedata-client';

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

/** Trading days in the return and volatility windows (about a month). */
const WINDOW = 20;
const SMA_DAYS = 125;

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

const signed = (n: number, digits = 1) => `${n >= 0 ? '+' : ''}${n.toFixed(digits)}%`;

/** % return over the last WINDOW trading days. */
function windowReturn(closes: number[]): number {
  const last = closes[closes.length - 1];
  const start = closes[closes.length - 1 - WINDOW];
  return (last / start - 1) * 100;
}

/** Standard deviation of the last WINDOW daily returns, in %. */
function dailyVolatility(closes: number[]): number {
  const recent = closes.slice(-(WINDOW + 1));
  const returns = recent.slice(1).map((c, i) => c / recent[i] - 1);
  const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1);
  return Math.sqrt(variance) * 100;
}

// The score mappings below are calibration knobs: each puts a typical market
// near 50 and a rare extreme at the 5/95 clamps.

// Annualized realized vol: ~10% calm (≈74), ~17% typical (50), 30%+ panic (5).
function volatilityToScore(annualizedPct: number): number {
  return Math.round(clamp(50 - 3.5 * (annualizedPct - 17), 5, 95));
}

// SPY above 125d SMA = bullish momentum, below = bearish
function momentumToScore(pctFromSma: number): number {
  return Math.round(clamp(50 + pctFromSma * 5, 5, 95));
}

// HYG beating LQD over 20 days = risk appetite. ±2% is a big month.
function bondSpreadToScore(spread: number): number {
  return Math.round(clamp(50 + spread * 15, 5, 95));
}

// SPY beating TLT over 20 days = risk-on. ±6% is a big month.
function safeHavenToScore(divergence: number): number {
  return Math.round(clamp(50 + divergence * 5, 5, 95));
}

/** Null when SPY's history can't be loaded: without it no signal means anything. */
export async function computeMarketMood(): Promise<MarketMoodData | null> {
  const now = Math.floor(Date.now() / 1000);
  // ~140 trading days: enough for the 125-day average with room for holidays.
  const from = now - 200 * 86_400;
  const symbols = ['SPY', 'HYG', 'LQD', 'TLT'] as const;
  const results = await Promise.allSettled(symbols.map((s) => getStockCandles(s, from, now, 'D')));

  const closes = new Map<string, number[]>();
  results.forEach((r, i) => {
    if (r.status === 'fulfilled' && r.value.c.length > WINDOW) closes.set(symbols[i], r.value.c);
    else console.warn(`[market/mood] no history for ${symbols[i]}:`, r.status === 'rejected' ? r.reason : 'too few bars');
  });

  const spy = closes.get('SPY');
  if (!spy) return null;
  const hyg = closes.get('HYG');
  const lqd = closes.get('LQD');
  const tlt = closes.get('TLT');

  type WeightedSignal = MoodSignal & { weight: number };
  const available: WeightedSignal[] = [];

  {
    const daily = dailyVolatility(spy);
    const annualized = daily * Math.sqrt(252);
    const score = volatilityToScore(annualized);
    available.push({
      weight: 0.35,
      name: 'Market Volatility',
      score,
      label: scoreToLabel(score),
      detail: `SPY has swung about ${daily.toFixed(1)}% on a typical day over the last ${WINDOW} trading days. ${
        annualized < 12 ? 'A calm market, investors are relaxed.'
          : annualized < 20 ? 'Normal swings.'
          : annualized < 30 ? 'A choppy, nervous market.'
          : 'Big swings, investors are on edge.'
      }`,
      raw: { dailyVolPct: daily, annualizedVolPct: annualized },
    });
  }

  if (spy.length >= SMA_DAYS) {
    const price = spy[spy.length - 1];
    const sma = spy.slice(-SMA_DAYS).reduce((s, c) => s + c, 0) / SMA_DAYS;
    const pct = (price / sma - 1) * 100;
    const score = momentumToScore(pct);
    available.push({
      weight: 0.30,
      name: 'S&P 500 Momentum',
      score,
      label: scoreToLabel(score),
      detail: `SPY $${price.toFixed(2)} is ${Math.abs(pct).toFixed(1)}% ${pct >= 0 ? 'above' : 'below'} its ${SMA_DAYS}-day average. ${
        pct > 5 ? 'Strong bullish trend.' : pct > 0 ? 'Mild bullish bias.' : pct > -5 ? 'Mild bearish pressure.' : 'Bearish momentum.'
      }`,
      raw: { price, sma125: sma, pctFromSma: pct },
    });
  }

  if (hyg && lqd) {
    const h = windowReturn(hyg);
    const l = windowReturn(lqd);
    const score = bondSpreadToScore(h - l);
    available.push({
      weight: 0.20,
      name: 'Junk Bond Demand',
      score,
      label: scoreToLabel(score),
      detail: `Over ${WINDOW} trading days, junk bonds (HYG) returned ${signed(h)} vs investment grade (LQD) ${signed(l)}. ${
        h > l ? 'Investors are reaching for yield, a sign of risk appetite.' : 'Investors prefer safer bonds, a sign of caution.'
      }`,
      raw: { hyg: h, lqd: l, spread: h - l },
    });
  }

  if (tlt) {
    const s = windowReturn(spy);
    const t = windowReturn(tlt);
    const score = safeHavenToScore(s - t);
    available.push({
      weight: 0.15,
      name: 'Safe Haven Demand',
      score,
      label: scoreToLabel(score),
      detail: `Over ${WINDOW} trading days, stocks (SPY) returned ${signed(s)} vs Treasuries (TLT) ${signed(t)}. ${
        s > t ? 'Stocks are winning, investors are taking risk.' : 'Treasuries are winning, investors are playing it safe.'
      }`,
      raw: { spy: s, tlt: t, divergence: s - t },
    });
  }

  // Normalize weights to 1.0 across available signals, then compute composite
  const totalWeight = available.reduce((s, sig) => s + sig.weight, 0);
  const composite = Math.round(
    available.reduce((s, sig) => s + sig.score * (sig.weight / totalWeight), 0)
  );

  const signals: MoodSignal[] = available.map(({ weight: _, ...rest }) => rest);

  return {
    composite,
    label: scoreToLabel(composite),
    signals,
    generatedAt: new Date().toISOString(),
  };
}
