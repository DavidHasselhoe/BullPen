/**
 * The app spells share classes with a dot (BRK.B, BF.A, MOG.A): search_index,
 * screener_stats, ticker_sectors, sp500.ts and TwelveData all agree. The ISIN
 * search fallback in resolve-cusip.ts can return the hyphen form (BRK-B), which
 * then matched nothing: Berkshire's $611M position showed no sector and no
 * stock-page data because "BRK-B" is not a key anywhere else.
 *
 * Only a single-letter class after a hyphen is rewritten. Nothing in the
 * catalogue uses a hyphen for anything else (verified 2026-09-15), and a
 * narrower rule can't turn an unrelated ticker into a wrong one.
 */
export function normalizeShareClassSymbol(symbol: string): string {
  return symbol.replace(/^([A-Z]+)-([A-Z])$/, '$1.$2');
}
