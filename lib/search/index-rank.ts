/**
 * Popularity ranks for the search index, 0-99.
 *
 * These are precomputed when the index is refreshed rather than at query time,
 * because the browser scores ~17k rows on every keystroke and every bit of work
 * moved out of that loop is work it does 17,000 times less often.
 *
 * Rank only breaks ties *within* a match tier — an exact ticker hit always wins
 * over a name match regardless of rank. It exists so that "micro" leads with
 * Microsoft and Micron instead of MicroAlgo, and "coca" with Coca-Cola instead
 * of Coca-Cola Consolidated.
 */

/** Market-cap magnitude on a 0-99 scale: $100M → 20, $1B → 30, $1T → 60. */
export function rankFromMarketCap(marketCap: number | null | undefined): number {
  if (!marketCap || marketCap <= 0) return 0;
  return Math.max(0, Math.min(99, Math.round((Math.log10(marketCap) - 6) * 10)));
}

/**
 * Products whose names mark them as leveraged, inverse or otherwise structured.
 * There are thousands of these and they crowd out the fund people meant: a bare
 * "tesl" search surfaces nine Tesla-derivative ETFs before TSLA itself.
 */
const STRUCTURED_ETF = /\b(\d(\.\d)?x|inverse|ultra(short|pro)?|leveraged|daily target|weekly|covered call|buffer|defined outcome|managed|enhanced|premium income)\b/i;

/**
 * The funds most beginners actually hold, by assets under management. Shape
 * alone gave every three-letter Vanguard ETF the same rank, so "vanguard" fell
 * back to catalogue order (BIV, BLV, BND...) and never reached VOO or VTI, and
 * "s&p 500" offered value and growth slices before SPY, VOO and IVV.
 *
 * ponytail: a hand-kept list of ~30 tickers, the stand-in for the AUM column
 * described below. The set barely moves year to year; add a fund when a
 * beginner can't find it by name.
 */
const CORE_RETAIL_ETFS = new Map<string, number>([
  // The S&P 500, total-market and Nasdaq-100 trackers people mean first.
  ...['SPY', 'VOO', 'IVV', 'VTI', 'QQQ'].map((t) => [t, 80] as [string, number]),
  ...[
    'QQQM', 'SPLG', 'VUG', 'VTV', 'VEA', 'VXUS', 'VWO', 'VT', 'IEFA', 'IEMG', 'AGG', 'BND', 'BNDX',
    'IWM', 'IJH', 'SCHD', 'VIG', 'VYM', 'VGT', 'XLK', 'XLF', 'DIA', 'GLD', 'IAU', 'VNQ', 'ITOT', 'RSP',
  ].map((t) => [t, 70] as [string, number]),
]);

/**
 * ETFs have no market cap in our data, so rank falls back to shape: a short
 * ticker on a plain-named fund is overwhelmingly likely to be one of the large
 * index funds people actually search for.
 *
 * ponytail: heuristic, not a measurement. TwelveData's reference feed carries no
 * AUM or volume. If fund ranking needs to be better than "SPY/QQQ/VOO first",
 * the upgrade is an AUM column from a fundamentals endpoint, not a longer regex.
 */
export function rankFromEtfName(ticker: string, name: string): number {
  const core = CORE_RETAIL_ETFS.get(ticker);
  if (core) return core;
  if (STRUCTURED_ETF.test(name)) return 5;
  if (ticker.length <= 3) return 45;
  if (ticker.length === 4) return 30;
  return 20;
}

/**
 * Stand-in rank for an index member we hold no market cap for.
 *
 * Deliberately a fallback rather than a floor. Applied as a floor it flattened
 * all 500 S&P members onto one value, which is how "coca" ended up leading with
 * Coca-Cola Europacific ($60B) over The Coca-Cola Company ($300B), and "nv"
 * with NVR over NVIDIA: real market caps got overwritten by a constant.
 */
export const INDEX_MEMBER_RANK = 50;

/**
 * Index funds. They are all index funds by construction (the refresh only takes
 * the ones whose name says so), and we hold no AUM to separate them, so they get
 * one flat rank: below a core ETF, above a four-letter niche one.
 *
 * The effect is that a name search like "vanguard 500" leads with VOO and offers
 * VFIAX just under it, which matches how people actually buy: the ETF is the
 * more liquid wrapper of the same index. Typing the fund's own ticker is an
 * exact match and unaffected by any of this.
 */
export const INDEX_FUND_RANK = 35;
