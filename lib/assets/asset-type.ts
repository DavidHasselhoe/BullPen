export type AssetType = 'stock' | 'crypto' | 'commodity' | 'forex' | 'etf' | 'unknown';

// Well-known ETF tickers — used as a heuristic fallback when instrumentType is absent.
// Covers the vast majority of ETFs users will encounter in watchlists / trending / search.
const KNOWN_ETF_TICKERS = new Set([
  // Broad market
  'SPY','IVV','VOO','VTI','ITOT','SCHB','SPTM','ESGU',
  // Nasdaq / growth
  'QQQ','QQQM','TQQQ','SQQQ','VUG','IWF','SCHG','SPYG',
  // Small / mid cap
  'IWM','IWO','IWN','IJR','IJH','MDY','VBR','VBK',
  // International
  'VEA','IEFA','EFA','SPDW','VWO','EEM','IEMG','GWL',
  'EWG','EWU','EWA','EWC','EWH','EWS','EWT','EWY','EWI','EWP','EWQ','EWJ','EWZ','EWW','EWX',
  'MCHI','INDA','FXI','ASHR','EWT',
  // Bonds
  'AGG','BND','TLT','IEF','SHY','GOVT','LQD','HYG','JNK','BIL','VCIT','VCSH','BNDX','SGOV',
  'VGLT','VGIT','VGSH','SCHZ','MUB','TIP','VTIP','EMB','SPAB',
  // Commodities / Gold
  'GLD','IAU','GLDM','SLV','PDBC','GSG','DJP','COMB',
  'GDX','GDXJ','USO','UNG','DBA','MOO',
  // Real estate
  'VNQ','IYR','XLRE','SCHH','ICF','REM','MORT',
  // Sector ETFs (SPDR)
  'XLF','XLK','XLE','XLV','XLU','XLI','XLB','XLP','XLRE','XLY','XLC','XLY',
  // Sector (iShares / Vanguard / Invesco)
  'VFH','VGT','VDE','VHT','VPU','VIS','VAW','VDC','VCR','VOX',
  'IBB','XBI','ARKG','IHI','SOXX','SMH',
  'KRE','KBE','KIE','IAI',
  'ITB','XHB','JETS','AWAY',
  'ITA','PPA','DFEN',
  // Factor / smart beta
  'QUAL','MTUM','USMV','SIZE','VLUE','VIG','DGRO','DVY','HDV','SCHD','SDY','SPHD',
  // ARK Innovation
  'ARKK','ARKG','ARKQ','ARKF','ARKW','ARKX','PRNT','IZRL',
  // Leveraged / inverse
  'SPXL','SPXS','UPRO','SPXU','SSO','SDS','TQQQ','SQQQ','UVXY','SVXY','VXX',
  'FAS','FAZ','TNA','TZA','LABU','LABD',
  // Dividend / income
  'JEPI','JEPQ','SVOL','QYLD','XYLD','RYLD',
  // Thematic
  'BOTZ','AIQ','ROBO','IRBO','WCLD','CLOU','SKYY','BUG','HACK',
  'ICLN','TAN','QCLN','FAN','PBW','ACES',
  'LIT','BATT','DRIV','KARS',
  // Fixed income alternative
  'NEAR','JPST','MINT','ICSH',
  // Dow Jones
  'DIA',
  // Others commonly found on platforms
  'ACWI','ACWX','VT','VSS',
]);


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

// ─── Commodities ──────────────────────────────────────────────────────────────
// Spot prices TwelveData quotes. Its symbol search never returns these for
// "gold" or "oil" (only gold ETFs, mostly foreign), so they are listed here and
// matched by name in search. Copper (HG1) is in its /commodities list but
// returned no quote when checked on 2026-10-26.
/** How someone actually owns it: a fund holding the metal, a futures fund, miners, producers. */
export type OwnKind = 'physical' | 'futures' | 'miners' | 'producer' | 'sector';
export interface CommodityOwn { ticker: string; name: string; kind: OwnKind }

export interface Commodity {
  /** Stable key for icons and copy (stock.json commodityAbout_<id> etc.). */
  id: 'xau' | 'xag' | 'xpt' | 'xpd' | 'wti' | 'xbr';
  ticker: string;
  name: string;
  terms: string[];
  icon: string;
  group: 'metal' | 'oil';
  /** Grams per quoted unit (troy ounce) for metals; litres per barrel for oil. */
  unit: { per: 'gram' | 'litre'; size: number };
  own: CommodityOwn[];
}

const TROY_OUNCE_G = 31.1034768;
const BARREL_L = 158.987295;
const metal = { group: 'metal' as const, unit: { per: 'gram' as const, size: TROY_OUNCE_G } };
const oil = { group: 'oil' as const, unit: { per: 'litre' as const, size: BARREL_L } };

// Tickers checked to quote on 2026-10-26. The fund names are proper nouns and stay untranslated.
export const COMMODITIES: Commodity[] = [
  {
    id: 'xau', ticker: 'XAU/USD', name: 'Gold', terms: ['gold', 'xau'], icon: '/logos/commodities/xau.svg', ...metal,
    own: [
      { ticker: 'GLD', name: 'SPDR Gold Shares', kind: 'physical' },
      { ticker: 'IAU', name: 'iShares Gold Trust', kind: 'physical' },
      { ticker: 'GDX', name: 'VanEck Gold Miners ETF', kind: 'miners' },
      { ticker: 'NEM', name: 'Newmont', kind: 'producer' },
    ],
  },
  {
    id: 'xag', ticker: 'XAG/USD', name: 'Silver', terms: ['silver', 'xag'], icon: '/logos/commodities/xag.svg', ...metal,
    own: [
      { ticker: 'SLV', name: 'iShares Silver Trust', kind: 'physical' },
      { ticker: 'SIL', name: 'Global X Silver Miners ETF', kind: 'miners' },
      { ticker: 'PAAS', name: 'Pan American Silver', kind: 'producer' },
    ],
  },
  {
    id: 'xpt', ticker: 'XPT/USD', name: 'Platinum', terms: ['platinum', 'xpt'], icon: '/logos/commodities/xpt.svg', ...metal,
    own: [
      { ticker: 'PPLT', name: 'abrdn Platinum ETF', kind: 'physical' },
      { ticker: 'SBSW', name: 'Sibanye Stillwater', kind: 'producer' },
    ],
  },
  {
    id: 'xpd', ticker: 'XPD/USD', name: 'Palladium', terms: ['palladium', 'xpd'], icon: '/logos/commodities/xpd.svg', ...metal,
    own: [
      { ticker: 'PALL', name: 'abrdn Palladium ETF', kind: 'physical' },
      { ticker: 'SBSW', name: 'Sibanye Stillwater', kind: 'producer' },
    ],
  },
  {
    id: 'wti', ticker: 'WTI/USD', name: 'Crude oil (WTI)', terms: ['oil', 'crude', 'wti'], icon: '/logos/commodities/wti.svg', ...oil,
    own: [
      { ticker: 'USO', name: 'United States Oil Fund', kind: 'futures' },
      { ticker: 'XLE', name: 'Energy Select Sector SPDR', kind: 'sector' },
      { ticker: 'XOM', name: 'Exxon Mobil', kind: 'producer' },
      { ticker: 'CVX', name: 'Chevron', kind: 'producer' },
    ],
  },
  {
    id: 'xbr', ticker: 'XBR/USD', name: 'Crude oil (Brent)', terms: ['oil', 'crude', 'brent', 'xbr'], icon: '/logos/commodities/xbr.svg', ...oil,
    own: [
      { ticker: 'BNO', name: 'United States Brent Oil Fund', kind: 'futures' },
      { ticker: 'SHEL', name: 'Shell', kind: 'producer' },
      { ticker: 'BP', name: 'BP', kind: 'producer' },
    ],
  },
];

/** The commodity for a symbol or slug ('XAU/USD', 'XAU-USD'), or undefined. */
export function findCommodity(tickerOrSlug: string): Commodity | undefined {
  const sym = slugToSymbol(tickerOrSlug.toUpperCase());
  return COMMODITIES.find((c) => c.ticker === sym);
}

const COMMODITY_TICKERS = new Set<string>(COMMODITIES.map((c) => c.ticker));

/** The bundled icon for a spot commodity ("XAU/USD" or slug "XAU-USD"); no logo source has one. */
export function commodityIcon(ticker: string): string | undefined {
  const sym = slugToSymbol(ticker.toUpperCase());
  return COMMODITIES.find((c) => c.ticker === sym)?.icon;
}

/** Commodities whose name or symbol the query starts, or names as a whole word ("gold price"). */
export function matchCommodities(query: string) {
  const q = query.trim().toLowerCase();
  if (q.length < 3) return [];
  const words = q.split(/[^a-z]+/);
  return COMMODITIES.filter((c) => c.terms.some((t) => t.startsWith(q) || words.includes(t)));
}

// TwelveData instrument_type values for non-equity assets. Its /commodities
// list files spot metals and energy under the last three, not "Commodity".
const CRYPTO_TYPES    = new Set(['Digital Currency', 'Cryptocurrency']);
export const COMMODITY_TYPES = new Set(['Commodity', 'Physical Currency', 'Precious Metal', 'Industrial Metal', 'Energy Resource']);
const FOREX_TYPES     = new Set(['Currency', 'Forex']);
// Mutual funds route and render exactly like ETFs: same price/chart page, same
// absence of earnings and financials. Only the label differs, via fundLabel().
const ETF_TYPES       = new Set(['ETF', 'Exchange-Traded Note', 'Closed-end Fund', 'Mutual Fund']);

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

  // Static registry of well-known ETF tickers (heuristic when instrumentType is absent)
  const sym = symbol.toUpperCase();
  if (KNOWN_ETF_TICKERS.has(sym)) return 'etf';
  // Before the crypto pattern below, which WTI/USD also fits.
  if (COMMODITY_TICKERS.has(sym)) return 'commodity';

  // Precious-metal spot prices: XAU/USD, XAG/USD, XPT/USD, XPD/USD
  if (/^X[A-Z]{2}\/USD$/.test(sym)) return 'commodity';

  // Futures: CL1!, NG1!, GC1!, ZW1!, etc.
  if (/^[A-Z]{1,3}\d!?$/.test(sym)) return 'commodity';

  // Crypto pairs: BTC/USD, ETH/USD, SOL/USD — uppercase alpha base + /USD or /EUR etc.
  if (/^[A-Z]{2,10}\/[A-Z]{3,4}$/.test(sym)) return 'crypto';

  return 'stock';
}

// ─── Type guards ──────────────────────────────────────────────────────────────

/**
 * No US exchange sessions: no pre-market, after-hours or 9:30 open. Crypto
 * trades 24/7; commodities and forex nearly 24h on weekdays. Gold was charted
 * as a stock, its morning drawn grey and labelled "Pre-market".
 */
export const has24hTrading = (t: AssetType): boolean => t === 'crypto' || t === 'commodity' || t === 'forex';
export const hasEarnings   = (t: AssetType): boolean => t === 'stock' || t === 'etf';
export const hasFinancials = (t: AssetType): boolean => t === 'stock';
export const isCrypto      = (t: AssetType): boolean => t === 'crypto';

/**
 * What to call a fund on screen. The page is shared between ETFs and mutual
 * funds, but calling an index fund an ETF is simply wrong, and this is exactly
 * the kind of detail a beginner would take at face value.
 */
export function fundLabel(instrumentType?: string): string {
  if (instrumentType === 'Mutual Fund') return 'Index fund';
  if (instrumentType === 'Closed-end Fund') return 'Closed-end fund';
  if (instrumentType === 'Exchange-Traded Note') return 'ETN';
  return 'ETF';
}

/**
 * US exchange MICs. A holding pinned to one is the same listing a bare symbol
 * already resolves to, so the pin protects nothing.
 */
const US_MICS = new Set(['XNAS', 'XNGS', 'XNMS', 'XNCM', 'XNYS', 'ARCX', 'BATS', 'XASE', 'IEXG']);

/**
 * The mic_code worth honouring, or null. Pins exist so a foreign listing never
 * borrows a US ticker's price (bare KOG is Kroger, not Kongsberg), and pinned
 * symbols skip the live stream and the last-price fallback for that reason.
 * A US pin got the same treatment for no benefit: a QA holding of MSFT pinned
 * to XNGS lost its price whenever the pinned pre-market quote dropped, and
 * Holdings showed a total missing ~$4,100 until the next refetch.
 */
export function listingMic(mic: string | null | undefined): string | null {
  return mic && !US_MICS.has(mic.toUpperCase()) ? mic : null;
}
