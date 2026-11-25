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
 *  - X (United States Steel, NYSE, delisted 2025 after the Nippon Steel
 *    acquisition) now resolves to TMX Group (TSX, Canada): profile, statistics,
 *    statements and earnings were all TMX's. /stocks has no US listing for X,
 *    which is why the screener universe already drops it.
 *  - BLD (TopBuild, NYSE), NDX and ETF (checked 2026-11-05, /symbol_search):
 *    TwelveData has no US listing under these symbols. BLD resolves to British
 *    Land (UK REIT, GBP statements), NDX to the Nordex SE ADR (EUR statements),
 *    ETF to Eastfield Resources (TSXV, zero revenue).
 *  - THR (Thermon Group, NYSE), checked 2026-11-25 (/stocks): only Thor Energy
 *    Plc (LSE) and its ASX/CXA CDIs.
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
  X: { collidesWith: 'TMX Group Limited (TSX, Canada)', unavailable: true },
  BLD: { collidesWith: 'British Land Company PLC (UK REIT; Frankfurt listing, EUR)', unavailable: true },
  NDX: { collidesWith: 'Nordex SE - Unsponsored ADR (Frankfurt, Germany, EUR)', unavailable: true },
  ETF: { collidesWith: 'Eastfield Resources Ltd. (TSXV, Canada)', unavailable: true },
  THR: { collidesWith: 'Thor Energy Plc (LSE, United Kingdom)', unavailable: true },
};

/**
 * Tickers whose TwelveData listing is the right company (prices, statements,
 * website, CEO, industry all check out) but whose reference data carries
 * ANOTHER company's name: in /stocks, which feeds search_index and so every
 * display name, and in /profile, whose description is that other company's
 * too. Bull then called Huntington Bancshares "HubSpot, a software company"
 * and the AI peer list for KKR was RNA biotechs. Checked 2026-11-25.
 *
 * Found by comparing cached profile names to SEC names:
 *   select p.ticker, p.payload->'profile'->>'name', ci.name
 *   from market_data_cache p join company_index ci using (ticker)
 *   where p.cache_key = 'profile:' || p.ticker  -- then eyeball the mismatches
 * Most mismatches there are just "The X Company" vs "X CO"; rerun it now and then.
 */
export const NAME_FIXES: Record<string, string> = {
  A: 'Agilent Technologies, Inc.',        // TD: AgileThought, Inc.
  HBAN: 'Huntington Bancshares Incorporated', // TD: HubSpot Inc.
  KKR: 'KKR & Co. Inc.',                  // TD: Korro Bio, Inc.
  MTB: 'M&T Bank Corporation',            // TD /profile: CareCloud, Inc.
};

export function getTickerOverride(symbol: string): TickerOverride | undefined {
  return TICKER_OVERRIDES[symbol.toUpperCase()];
}

/** Throws before a fetch that would return the colliding company's data (and spend credits on it). */
export function assertNoTickerCollision(symbol: string): void {
  const override = getTickerOverride(symbol);
  if (override?.unavailable) {
    throw new Error(
      `No reliable data for ${symbol} — Twelve Data resolves this symbol to ${override.collidesWith}, not the intended company`
    );
  }
}
