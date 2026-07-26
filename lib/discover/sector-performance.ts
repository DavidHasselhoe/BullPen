/**
 * Sector performance for the Discover chart.
 *
 * Each sector is priced by its SPDR sector ETF rather than by averaging our
 * curated constituent list. An unweighted mean of twelve hand-picked names is
 * not what the sector did — the ETF is, and it's one quote instead of twelve.
 *
 * All four timeframes come from two fetches:
 *   · one batched /quote for the live price and the 1D change  (11 credits, 60 s)
 *   · one daily /time_series per ETF back to Jan 1             (11 credits, 6 h)
 * The 1W / 1M / YTD windows are all derived from that single series, so adding
 * a timeframe costs nothing extra.
 */

import {
  getStockQuotes,
  getStockCandles,
  withRateLimitRetry,
  type StockCandles,
} from '@/lib/twelvedata/twelvedata-client';
import { getCached, setCached } from '@/lib/cache/market-data-cache';
import { rget, rset } from '@/lib/cache/redis-cache';
import {
  SECTOR_DISPLAY_ORDER,
  SECTOR_ETFS,
  TIMEFRAMES,
  type SectorPerformance,
  type Timeframe,
} from './discover-config';

const QUOTE_CACHE_KEY = 'discover:sector-quotes:v1';
const QUOTE_TTL_SECONDS = 60;
const CANDLE_TTL_SECONDS = 6 * 60 * 60;

/** Calendar days back for each historical window. YTD is handled separately. */
const LOOKBACK_DAYS: Record<Exclude<Timeframe, '1D' | 'YTD'>, number> = {
  '1W': 7,
  '1M': 30,
};

interface EtfQuote { price: number; changePct: number }

function toETDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

// ─── Live quotes (1D) ────────────────────────────────────────────────────────

async function loadQuotes(): Promise<Map<string, EtfQuote>> {
  const cached = await rget<Record<string, EtfQuote>>(QUOTE_CACHE_KEY);
  if (cached) return new Map(Object.entries(cached));

  try {
    const quotes = await withRateLimitRetry(() => getStockQuotes(SECTOR_ETFS));
    const out = new Map<string, EtfQuote>();
    const plain: Record<string, EtfQuote> = {};
    for (const [sym, q] of quotes.entries()) {
      if (!q || !Number.isFinite(q.c) || q.c <= 0) continue;
      const entry = { price: q.c, changePct: Number.isFinite(q.dp) ? q.dp : 0 };
      out.set(sym.toUpperCase(), entry);
      plain[sym.toUpperCase()] = entry;
    }
    void rset(QUOTE_CACHE_KEY, plain, QUOTE_TTL_SECONDS);
    return out;
  } catch (err) {
    console.error('[discover/sectors] quote fetch failed:', err);
    return new Map();
  }
}

// ─── Daily history (1W / 1M / YTD) ───────────────────────────────────────────

/**
 * One daily series per ETF, from Jan 1 of the current year. The cache key
 * carries the year so a new key is minted on 1 January rather than serving a
 * series that no longer starts where YTD does.
 */
async function loadHistory(symbol: string, yearStart: string): Promise<StockCandles | null> {
  const key = `discover:sector-candles:${symbol}:${yearStart}`;
  const cached = await getCached<StockCandles>(key);
  if (cached) return cached;

  try {
    // Pad the window back so a January page view still has bars to compare
    // against — on 2 January the year-to-date window contains one session.
    const from = Math.floor(new Date(`${yearStart}T00:00:00Z`).getTime() / 1000) - 45 * 86_400;
    const to = Math.floor(Date.now() / 1000);
    const candles = await withRateLimitRetry(() => getStockCandles(symbol, from, to, 'D'));
    if (candles.s === 'no_data' || candles.t.length === 0) return null;
    void setCached(key, symbol, 'candles', candles, CANDLE_TTL_SECONDS).catch(() => {});
    return candles;
  } catch (err) {
    console.error(`[discover/sectors] candle fetch failed for ${symbol}:`, err);
    return null;
  }
}

/** Last close on or before `date`. Null when the series doesn't reach back that far. */
function closeOnOrBefore(candles: StockCandles, date: string): number | null {
  for (let i = candles.t.length - 1; i >= 0; i--) {
    if (toETDate(candles.t[i]) <= date) return candles.c[i];
  }
  return null;
}

/** First close on or after `date` — the YTD anchor. */
function closeOnOrAfter(candles: StockCandles, date: string): number | null {
  for (let i = 0; i < candles.t.length; i++) {
    if (toETDate(candles.t[i]) >= date) return candles.c[i];
  }
  return null;
}

// ─── Entry point ─────────────────────────────────────────────────────────────

/**
 * Performance for every sector across every timeframe, each list already sorted
 * best → worst so the chart renders straight from the payload.
 *
 * A sector whose data is unavailable keeps a null `changePct` and sorts to the
 * bottom rather than being dropped — a missing row would silently misrepresent
 * the market as having ten sectors.
 */
export async function getSectorPerformance(): Promise<Record<Timeframe, SectorPerformance[]>> {
  const yearStart = `${new Date().getUTCFullYear()}-01-01`;

  const [quotes, ...histories] = await Promise.all([
    loadQuotes(),
    ...SECTOR_ETFS.map((sym) => loadHistory(sym, yearStart)),
  ]);

  const historyByEtf = new Map<string, StockCandles>();
  SECTOR_ETFS.forEach((sym, i) => {
    const h = histories[i];
    if (h) historyByEtf.set(sym, h);
  });

  const result = {} as Record<Timeframe, SectorPerformance[]>;

  for (const timeframe of TIMEFRAMES) {
    const rows: SectorPerformance[] = SECTOR_DISPLAY_ORDER.map((sector) => {
      const quote = quotes.get(sector.etf);
      const base = { key: sector.key, label: sector.label, etf: sector.etf };

      if (timeframe === '1D') {
        return { ...base, changePct: quote ? quote.changePct : null };
      }

      const history = historyByEtf.get(sector.etf);
      if (!history) return { ...base, changePct: null };

      const reference =
        timeframe === 'YTD'
          ? closeOnOrAfter(history, yearStart)
          : closeOnOrBefore(history, isoDaysAgo(LOOKBACK_DAYS[timeframe]));

      // Prefer the live price as "now" so every timeframe ends at the same
      // moment the 1D column does; fall back to the last close if there's no
      // quote, rather than dropping the row.
      const now = quote?.price ?? history.c[history.c.length - 1] ?? null;

      if (reference == null || now == null || reference <= 0) {
        return { ...base, changePct: null };
      }
      return { ...base, changePct: (now / reference - 1) * 100 };
    });

    rows.sort((a, b) => {
      if (a.changePct == null) return 1;
      if (b.changePct == null) return -1;
      return b.changePct - a.changePct;
    });

    result[timeframe] = rows;
  }

  return result;
}
