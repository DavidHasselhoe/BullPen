import type { PortfolioHolding } from './schema';

/**
 * Rescales allocation_pct so the array sums to exactly 100 (integer).
 * Used after dropping invalid tickers or merging in replacements.
 *
 * Strategy: scale proportionally, round each, then push the rounding delta into the
 * single largest-allocation holding so the total is exactly 100.
 */
export function renormalizeAllocations(holdings: PortfolioHolding[]): PortfolioHolding[] {
  if (holdings.length === 0) return holdings;

  const currentTotal = holdings.reduce((sum, h) => sum + h.allocation_pct, 0);
  if (currentTotal === 100) return holdings;
  if (currentTotal === 0) {
    // All allocations are zero — distribute equally rather than producing NaN.
    const equal = Math.floor(100 / holdings.length);
    const remainder = 100 - equal * holdings.length;
    return holdings.map((h, i) => ({ ...h, allocation_pct: equal + (i === 0 ? remainder : 0) }));
  }

  // Scale each holding proportionally
  const scaled = holdings.map((h) => ({
    ...h,
    allocation_pct: Math.max(1, Math.round((h.allocation_pct / currentTotal) * 100)),
  }));

  // Push rounding delta into the largest holding
  const newTotal = scaled.reduce((sum, h) => sum + h.allocation_pct, 0);
  const delta = 100 - newTotal;
  if (delta !== 0 && scaled.length > 0) {
    const largestIdx = scaled.reduce(
      (maxIdx, h, i) => (h.allocation_pct > scaled[maxIdx].allocation_pct ? i : maxIdx),
      0
    );
    scaled[largestIdx] = {
      ...scaled[largestIdx],
      allocation_pct: scaled[largestIdx].allocation_pct + delta,
    };
  }

  return scaled;
}
