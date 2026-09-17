/**
 * Asserts the share card's headline is the same number the Holdings page's
 * "Today's gain / loss" tile renders: Σ (price − prevClose) × qty over
 * Σ prevClose × qty (PortfolioDashboard.tsx). The card used to baseline on
 * the first 04:00 candle instead, which quietly dropped the overnight gap in
 * pre-market and disagreed with the page it was shared from.
 *
 * Run: npx tsx scripts/test-share-card-math.ts
 */
import assert from 'node:assert/strict';
import { computeTodaySparkline, type SparklineHolding, type CandleData } from '../lib/holdings/today-sparkline';

/** The page's own formula, transcribed from PortfolioDashboard.tsx. */
function pageToday(holdings: SparklineHolding[]) {
  let todayDollar = 0;
  let totalValue = 0;
  for (const h of holdings) {
    if (h.currentPrice == null || h.prevClose == null) continue;
    todayDollar += (h.currentPrice - h.prevClose) * h.quantity;
    totalValue += h.currentPrice * h.quantity;
  }
  const yesterdayValue = totalValue - todayDollar;
  return { todayDollar, todayPct: yesterdayValue > 0 ? (todayDollar / yesterdayValue) * 100 : 0 };
}

const holdings: SparklineHolding[] = [
  { symbol: 'AAPL', quantity: 10, prevClose: 200, currentPrice: 206 },
  { symbol: 'MSFT', quantity: 4, prevClose: 400, currentPrice: 398 },
  // Nothing has traded in pre-market for this one — no candles at all.
  { symbol: 'KO', quantity: 50, prevClose: 60, currentPrice: 60.5 },
];

// Candles cover only part of the book, and start well above previous close —
// a gap up at 04:00 is exactly what the old baseline threw away.
const candles: Record<string, CandleData | null> = {
  AAPL: { t: [100, 160, 220], c: [205, 205.5, 206] },
  MSFT: { t: [100, 220], c: [399, 398] },
  KO: null,
};

const result = computeTodaySparkline(holdings, candles);
assert.ok(result, 'expected a result when quotes are present');

const page = pageToday(holdings);
assert.ok(Math.abs(result.pct - page.todayPct) < 1e-9, `pct ${result.pct} != page ${page.todayPct}`);
assert.ok(Math.abs(result.pnlUsd - page.todayDollar) < 1e-9, `pnl ${result.pnlUsd} != page ${page.todayDollar}`);

// A symbol with no candles still counts toward the headline (KO's +$25 here).
assert.ok(Math.abs(result.pnlUsd - 77) < 1e-9, `expected +77, got ${result.pnlUsd}`);

// The curve ends on the headline instead of on a partially-covered minute.
assert.ok(
  Math.abs(result.points[result.points.length - 1] - result.pct) < 1e-9,
  'sparkline should land on the headline percentage'
);

// No quotes at all is "nothing to share", never a fabricated 0%.
assert.equal(
  computeTodaySparkline([{ symbol: 'AAPL', quantity: 10, prevClose: null, currentPrice: null }], {}),
  null
);

console.log('share card math OK — headline matches the Holdings page');
