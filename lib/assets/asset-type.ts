export type AssetType = 'stock' | 'crypto' | 'commodity' | 'forex' | 'etf' | 'unknown';

// ─── Symbol ↔ Slug conversion ─────────────────────────────────────────────────
// TwelveData canonical symbols contain '/' for pairs (BTC/USD, XAU/USD).
// Next.js route segments can't contain '/', so we use a hyphen slug in URLs.
// Rule: a slug is a pair when it matches /^[A-Z0-9]+-[A-Z]{2,4}$/

export function slugToSymbol(slug: string): string {
  return slug.replace(/^([A-Z0-9]+)-([A-Z]{2,4})$/, '$1/$2');
}

export function symbolToSlug(symbol: string): string {
  return symbol.replace('/', '-');
}

// ─── Asset-aware navigation helper ───────────────────────────────────────────
// Stocks → /stock/AAPL, ETFs → /etf/SPY, crypto/commodity → /asset/BTC-USD.
// instrumentType is the TwelveData instrument_type string; when supplied the
// path is exact. Without it the heuristic returns 'stock' for ambiguous tickers
// (e.g. SPY looks like a stock symbol), so the stock page redirects at runtime.

export function slugToAssetPath(symbolOrSlug: string, instrumentType?: string): string {
  const slug = symbolToSlug(symbolOrSlug);
  const sym = slugToSymbol(slug);
  const type = inferAssetType(sym, instrumentType);
  if (type === 'etf') return `/etf/${sym}`;
  if (type === 'stock' || type === 'unknown') return `/stock/${sym}`;
  return `/asset/${slug}`;
}

// ─── Type inference ───────────────────────────────────────────────────────────

// TwelveData instrument_type values for non-equity assets
const CRYPTO_TYPES    = new Set(['Digital Currency', 'Cryptocurrency']);
const COMMODITY_TYPES = new Set(['Commodity', 'Physical Currency']);
const FOREX_TYPES     = new Set(['Currency', 'Forex']);
const ETF_TYPES       = new Set(['ETF', 'Exchange-Traded Note', 'Closed-end Fund']);

export function inferAssetType(symbol: string, instrumentType?: string): AssetType {
  if (instrumentType) {
    if (CRYPTO_TYPES.has(instrumentType))    return 'crypto';
    if (COMMODITY_TYPES.has(instrumentType)) return 'commodity';
    if (FOREX_TYPES.has(instrumentType))     return 'forex';
    if (ETF_TYPES.has(instrumentType))       return 'etf';
    if (
      instrumentType === 'Common Stock' ||
      instrumentType === 'ADR' ||
      instrumentType === 'GDR' ||
      instrumentType === 'REIT' ||
      instrumentType === 'Preferred Stock'
    ) return 'stock';
  }

  // Heuristic from symbol format when instrumentType is unavailable
  const sym = symbol.toUpperCase();

  // Precious-metal spot prices: XAU/USD, XAG/USD, XPT/USD, XPD/USD
  if (/^X[A-Z]{2}\/USD$/.test(sym)) return 'commodity';

  // Futures: CL1!, NG1!, GC1!, ZW1!, etc.
  if (/^[A-Z]{1,3}\d!?$/.test(sym)) return 'commodity';

  // Crypto pairs: BTC/USD, ETH/USD, SOL/USD — uppercase alpha base + /USD or /EUR etc.
  if (/^[A-Z]{2,10}\/[A-Z]{3,4}$/.test(sym)) return 'crypto';

  return 'stock';
}

// ─── Type guards ──────────────────────────────────────────────────────────────

export const has24hTrading = (t: AssetType): boolean => t === 'crypto';
export const hasEarnings   = (t: AssetType): boolean => t === 'stock' || t === 'etf';
export const hasFinancials = (t: AssetType): boolean => t === 'stock';
export const isCrypto      = (t: AssetType): boolean => t === 'crypto';
export const isEquity      = (t: AssetType): boolean => t === 'stock' || t === 'etf';
