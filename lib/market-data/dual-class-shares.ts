/**
 * Dual-class share pairs that are both real, separate index constituents
 * (S&P 500 includes GOOG *and* GOOGL, FOX *and* FOXA, NWS *and* NWSA), so
 * they legitimately both appear in our ticker universes. That's correct for
 * a user's own holdings/watchlist (they may specifically own one class), but
 * it reads as a bug in any "one row per company" view — the same company
 * takes two slots in movers/screener with near-identical stats.
 *
 * Maps the non-canonical ticker to the one we keep in those limited-slot
 * views. Picked by voting rights / the more commonly quoted symbol, not
 * market cap or liquidity.
 */
export const DUAL_CLASS_CANONICAL: Record<string, string> = {
  GOOG: 'GOOGL',
  FOX: 'FOXA',
  NWS: 'NWSA',
};

/** True when `ticker` is the duplicate half of a dual-class pair and should be dropped from one-row-per-company views. */
export function isDuplicateShareClass(ticker: string): boolean {
  return ticker.toUpperCase() in DUAL_CLASS_CANONICAL;
}
