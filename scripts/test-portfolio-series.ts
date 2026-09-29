/**
 * Asserts for Home's portfolio line (lib/dashboard/portfolio-series.ts).
 * Run: npm run test-portfolio-series
 */
import assert from 'node:assert/strict';
import { buildPortfolioSeries } from '../lib/dashboard/portfolio-series';

const close = (a: number, b: number) => Math.abs(a - b) < 1e-9;

// A bar missing for one position carries its last price forward instead of
// dropping it from the sum (the old per-timestamp sum spiked to +10% here).
{
  const { points } = buildPortfolioSeries(
    [
      { candles: { t: [1, 2, 3], c: [10, 11, 12] }, quantity: 1, openedAt: 0, avgPrice: 8, prevClose: 10 },
      { candles: { t: [1, 3], c: [20, 22] }, quantity: 1, openedAt: 0, avgPrice: 15, prevClose: 20 },
    ],
    '1D',
  );
  const at2 = points.find((p) => p.t === 2)!;
  assert.ok(close(at2.pl, 1), `pl at t=2 should be 1, got ${at2.pl}`);
  assert.ok(close(at2.plPct, (1 / 30) * 100), `plPct at t=2 should be 3.33, got ${at2.plPct}`);
}

// 1D is measured from the previous close, so the line ends at the day's change.
{
  const { changeUSD } = buildPortfolioSeries(
    [{ candles: { t: [1, 2], c: [101, 103] }, quantity: 2, openedAt: 0, avgPrice: 50, prevClose: 100 }],
    '1D',
  );
  assert.equal(changeUSD, 6);
}

// Longer periods are measured from the period's first bar, not the previous close.
{
  const { changeUSD } = buildPortfolioSeries(
    [{ candles: { t: [1, 2], c: [101, 103] }, quantity: 2, openedAt: 0, avgPrice: 50, prevClose: 100 }],
    '1W',
  );
  assert.equal(changeUSD, 4);
}

// A position opened inside the period counts from its purchase price, and only from then.
{
  const { points } = buildPortfolioSeries(
    [
      { candles: { t: [1, 2, 3], c: [10, 10, 10] }, quantity: 1, openedAt: 0, avgPrice: 10 },
      { candles: { t: [1, 2, 3], c: [6, 6, 7] }, quantity: 1, openedAt: 2000, avgPrice: 5 },
    ],
    '1W',
  );
  assert.ok(close(points[0].pl, 0), 'before the purchase only the first position counts');
  assert.ok(close(points[2].pl, 2), `after it the second adds 7-5, got ${points[2].pl}`);
}

console.log('ok - portfolio series');
