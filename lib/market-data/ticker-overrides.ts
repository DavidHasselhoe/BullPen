/**
 * Curated fixes for tickers where a bare TwelveData symbol lookup resolves to
 * the wrong company. Unlike the screener/prefetch pipeline (which only ever
 * sweeps a known US-only universe, so "non-USD currency" is a safe blanket
 * signal of a collision — see app/api/cron/prefetch-market-data/route.ts),
 * the single-stock routes (`/api/stock/[ticker]/statistics`,
 * `/company-profile`) serve arbitrary tickers, including legitimately
 * foreign-listed holdings (e.g. a Norwegian user's Equinor position, priced
 * in NOK) — a blanket currency check there would incorrectly block those.
 *
 * So this list is intentionally narrow and explicit: only tickers confirmed,
 * via a live API call, to collide with an unrelated foreign listing.
 *
 * Confirmed so far — both recently renamed/spun-off US tickers, which is
 * likely why TwelveData's reference data hasn't caught up:
 *  - CTRA (Coterra Energy, NYSE, renamed from Cabot Oil & Gas in 2021)
 *    collides with Ciputra Development Tbk PT (IDX, Indonesia). TwelveData
 *    has no NYSE:CTRA listing at all — /symbol_search, /stocks, and every
 *    country/exchange/mic_code filter tried all come back empty or 404.
 *  - K (Kellanova, NYSE, spun off from Kellogg in 2023) collides with
 *    Kinross Gold Corporation (TSX, Canada). Same — no US listing under "K".
 *
 * If a future check finds TwelveData *does* have the correct listing behind
 * a country/exchange/mic_code filter, replace `unavailable` with a
 * `qualifier` here rather than leaving it marked unavailable.
 */
export interface TickerOverride {
  /** What the bare symbol resolves to instead, for logging/error messages. */
  collidesWith: string;
  /** No disambiguation qualifier gets the real company — TwelveData simply doesn't have it. */
  unavailable: true;
}

export const TICKER_OVERRIDES: Record<string, TickerOverride> = {
  CTRA: { collidesWith: 'Ciputra Development Tbk PT (IDX, Indonesia)', unavailable: true },
  K: { collidesWith: 'Kinross Gold Corporation (TSX, Canada)', unavailable: true },
};

export function getTickerOverride(symbol: string): TickerOverride | undefined {
  return TICKER_OVERRIDES[symbol.toUpperCase()];
}
