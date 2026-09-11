/**
 * The stock snapshot: quote (live, or a few seconds of Redis) plus statistics and
 * earnings (both server-cached). One TwelveData /batch round trip at worst, none
 * at all when everything is warm.
 *
 * Lives in lib rather than inside the route handler so the server can build it
 * directly while rendering a stock page, instead of the browser waiting for
 * hydration and then asking for it over HTTP. The route is now a thin wrapper.
 */

import { batchFetch, getStockQuote, withRateLimitRetry, TwelveDataInvalidSymbolError, reportDateToFiscalQuarter, sanitizeDividendYield } from '@/lib/twelvedata/twelvedata-client';
import { getIndexedKind, instrumentTypeForKind } from '@/lib/search/refresh-index';
import { getCached, getCachedWithMeta, getCachedStale, getCachedStaleWithMeta, setCached } from '@/lib/cache/market-data-cache';
import { rget, rset, candleTtlSeconds } from '@/lib/cache/redis-cache';
import { tryReserveOrganicCredits } from '@/lib/twelvedata/credit-budget';
import { slugToSymbol, inferAssetType, hasEarnings } from '@/lib/assets/asset-type';

const APIKEY = () => process.env.TWELVE_DATA_API_KEY ?? '';

// Statistics update once daily after market close
const STATS_TTL = 24 * 60 * 60;

// Earnings TTL scales down as the next report date approaches so users see
// fresh EPS actuals within minutes of a company reporting.
function earningsTtl(earnings: EarningsItem[]): number {
  const now = Date.now();
  const nextDate = earnings
    .filter((e) => e.epsActual === null)
    .map((e) => Date.parse(e.date))
    .filter((d) => d > now)
    .sort((a, b) => a - b)[0];

  if (nextDate === undefined) return 6 * 60 * 60;        // no upcoming — 6h
  const daysUntil = (nextDate - now) / (1000 * 60 * 60 * 24);
  if (daysUntil <= 1) return 10 * 60;                    // earnings day — 10 min
  if (daysUntil <= 3) return 30 * 60;                    // 3-day window — 30 min
  return 6 * 60 * 60;                                    // otherwise — 6h
}

function planRestricted(msg: string) {
  return /enterprise plan|higher plan|not available.*plan/i.test(msg);
}

type Statistics = Record<string, Record<string, unknown>>;
type EarningsItem = { date: string; time: string; epsEstimate: number | null; epsActual: number | null; quarter: number; year: number };

/** The quote shape this returns, cached as-is so a hit needs no reshaping. */
interface SnapshotQuote {
  price: number;
  change: number;
  changePercent: number;
  high: number;
  low: number;
  open: number;
  previousClose: number;
}

/** Shared with nothing else on purpose: the SSE seed cache (`seed:`) holds only
 *  price and previous close, and this response also renders open, high and low. */
function quoteCacheKey(sym: string): string {
  return `snapq:${sym}`;
}

export interface StockSnapshot {
  success: true;
  symbol: string;
  quote: SnapshotQuote | null;
  quoteConfirmedInvalid: boolean;
  statistics: Statistics | null;
  statsFetchedAt: string | null;
  earnings: EarningsItem[];
  instrumentType: string | null;
}

/**
 * Build a snapshot for a ticker or asset slug. Throws on upstream failure —
 * callers decide what a failure means (the route maps it to a status code, a
 * server render lets the client retry).
 */
export async function buildSnapshot(tickerParam: string): Promise<StockSnapshot> {
  const sym = slugToSymbol(tickerParam).toUpperCase();
  const assetType = inferAssetType(sym);
  const key = APIKEY();

    // Check cache for the expensive endpoints (50 + 20 credits)
    const [cachedStatsMeta, cachedEarnings, cachedQuote] = await Promise.all([
      getCachedWithMeta<Statistics>(`snap-stats:${sym}`),
      getCached<EarningsItem[]>(`snap-earnings:${sym}`),
      // The quote is the one part of this response that was always fetched
      // live, which made a warm snapshot cost the same 1.3-1.8s as a cold one.
      // A few seconds of Redis is enough for the whole burst of requests a
      // single page load produces, and for every other viewer of the same
      // ticker in that window. TTL follows the market session: 10s while the
      // market is open, 300s when it is closed and the number cannot change.
      rget<SnapshotQuote>(quoteCacheKey(sym)),
    ]);
    const cachedStats = cachedStatsMeta?.payload ?? null;
    let statsFetchedAt: string | null = cachedStatsMeta?.fetchedAt ?? null;

    // Reserve against the shared per-minute credit budget before committing to the
    // expensive sub-requests (see lib/twelvedata/credit-budget.ts). A denied
    // reservation means this ticker's stats/earnings fall back to the last known
    // cached value below, even past its normal TTL, rather than firing unreserved
    // and risking the account-wide 610/min cap on a burst of concurrent cold tickers.
    const wantsStats = !cachedStats;
    const wantsEarnings = !cachedEarnings && hasEarnings(assetType);
    const expensiveCost = (wantsStats ? 50 : 0) + (wantsEarnings ? 20 : 0);
    const budgetOk = expensiveCost === 0 || (await tryReserveOrganicCredits(expensiveCost));

    // Build batch — always include quote (real-time); skip cached or budget-denied endpoints
    const requests: Record<string, string> = {};
    if (!cachedQuote) requests.quote = `/quote?symbol=${sym}&apikey=${key}`;
    if (wantsStats && budgetOk) requests.statistics = `/statistics?symbol=${sym}&apikey=${key}`;
    if (wantsEarnings && budgetOk) requests.earnings = `/earnings?symbol=${sym}&outputsize=8&apikey=${key}`;

    // Retry-wrapped: a transient network blip here (common intermittently on Vercel's
    // outbound TwelveData calls) would otherwise leave quote null, which the stock page
    // treats as a signal the ticker doesn't exist for symbols with no Supabase companies row.
    // A fully warm snapshot — quote in Redis, stats and earnings in Supabase —
    // now costs zero TwelveData calls and zero credits.
    const raw =
      Object.keys(requests).length === 0
        ? ({} as Record<string, unknown>)
        : await withRateLimitRetry(() => batchFetch<Record<string, unknown>>(requests));

    // ---- Quote (from Redis when warm, otherwise fresh from the batch) ----
    let quote: SnapshotQuote | null = null;
    let instrumentType: string | null = null;

    // True only when Twelve Data has positively confirmed this symbol doesn't
    // exist (not merely "we have no quote right now") — the one signal the
    // stock page's not-found gate can safely trust. See TwelveDataInvalidSymbolError.
    let quoteConfirmedInvalid = false;

    if (cachedQuote) {
      quote = cachedQuote;
    }

    const q = raw.quote as Record<string, string | number> | undefined;
    if (q && !q.code && q.status !== 'error') {
      const close = parseFloat(String(q.close ?? 0));
      const change = parseFloat(String(q.change ?? 0));
      const pc = parseFloat(String(q.previous_close ?? close - change));
      quote = {
        price: close,
        change,
        changePercent: parseFloat(String(q.percent_change ?? 0)),
        high: parseFloat(String(q.high ?? close)),
        low: parseFloat(String(q.low ?? close)),
        open: parseFloat(String(q.open ?? close)),
        previousClose: pc,
      };
      instrumentType = q.type != null ? String(q.type) : null;
      void rset(quoteCacheKey(sym), quote, candleTtlSeconds());
    } else {
      // The batched /quote sub-request came back missing or errored even
      // though the overall /batch call succeeded — a per-symbol hiccup within
      // an otherwise-fine response, not something withRateLimitRetry's whole-
      // request retry covers. Root cause of the 2026-08-27 $SNOW false-positive
      // 404: this silently left `quote: null` with no distinguishing signal
      // and no log line, identical in shape to a genuinely invalid ticker. Try
      // once more with a plain single-symbol call (1 credit) before giving up.
      try {
        const direct = await getStockQuote(sym);
        quote = {
          price: direct.c,
          change: direct.d,
          changePercent: direct.dp,
          high: direct.h,
          low: direct.l,
          open: direct.o,
          previousClose: direct.pc,
        };
      } catch (fallbackErr) {
        if (fallbackErr instanceof TwelveDataInvalidSymbolError) {
          quoteConfirmedInvalid = true;
        } else {
          const msg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
          console.error(`[snapshot] ${sym} quote fallback failed:`, msg);
        }
      }
    }

    // ---- Statistics (cached, freshly fetched, or stale fallback under budget pressure) ----
    let statistics: Statistics | null = cachedStats;

    if (wantsStats && !budgetOk) {
      const stale = await getCachedStaleWithMeta<Statistics>(`snap-stats:${sym}`);
      statistics = stale?.payload ?? null;
      statsFetchedAt = stale?.fetchedAt ?? null;
    } else if (wantsStats) {
      const statRaw = raw.statistics as { statistics?: Statistics; code?: number; status?: string; message?: string } | undefined;
      if (statRaw && !statRaw.code && statRaw.status !== 'error' && statRaw.statistics) {
        const s = statRaw.statistics;
        const v = (s.valuations_metrics as Record<string, number>) ?? {};
        const sp = (s.stock_price_summary as Record<string, number>) ?? {};
        const ss = (s.stock_statistics as Record<string, number>) ?? {};
        const f = (s.financials as Record<string, unknown>) ?? {};
        const fi = (f.income_statement as Record<string, number>) ?? {};
        const d = (s.dividends_and_splits as { trailing_annual_dividend_yield?: number; dividend_date?: string }) ?? {};
        statistics = {
          marketCap: v.market_capitalization ?? null,
          enterpriseValue: v.enterprise_value ?? null,
          peRatioTTM: v.trailing_pe ?? null,
          peRatioForward: v.forward_pe ?? null,
          pbRatio: v.price_to_book_mrq ?? null,
          evToEbitda: v.enterprise_to_ebitda ?? null,
          psRatio: v.price_to_sales_ttm ?? null,
          beta: sp.beta ?? null,
          week52High: sp.fifty_two_week_high ?? null,
          week52Low: sp.fifty_two_week_low ?? null,
          avgVolume: ss.avg_90_volume ?? null,
          sharesFloat: ss.float_shares ?? null,
          shortRatio: ss.short_ratio ?? null,
          dividendYield: sanitizeDividendYield(d),
          profitMargin: (f.profit_margin as number) ?? null,
          revenueGrowthTTM: fi.quarterly_revenue_growth ?? null,
          epsGrowthTTM: fi.quarterly_earnings_growth_yoy ?? null,
        } as unknown as Statistics;

        // Fire-and-forget cache write
        statsFetchedAt = new Date().toISOString();
        void setCached(`snap-stats:${sym}`, sym, 'snap_statistics', statistics, STATS_TTL);
      } else if (statRaw?.message && planRestricted(statRaw.message)) {
        statistics = null;
      }
    }

    // ---- Earnings (cached, freshly fetched, or stale fallback under budget pressure) ----
    let earnings: EarningsItem[] = cachedEarnings ?? [];

    if (wantsEarnings && !budgetOk) {
      earnings = (await getCachedStale<EarningsItem[]>(`snap-earnings:${sym}`)) ?? [];
    } else if (wantsEarnings) {
      interface EarningsApiItem { date: string; time?: string; eps_estimate?: number | null; eps_actual?: number | null; }
      interface EarningsRaw { earnings?: EarningsApiItem[]; code?: number; status?: string; }
      const earningsRaw = raw.earnings as EarningsRaw | undefined;
      if (earningsRaw && !earningsRaw.code && earningsRaw.status !== 'error') {
        earnings = (earningsRaw.earnings ?? []).map((e) => {
          const { quarter, year } = reportDateToFiscalQuarter(e.date);
          return {
            date: e.date,
            time: e.time ?? '',
            epsEstimate: e.eps_estimate ?? null,
            epsActual: e.eps_actual ?? null,
            quarter,
            year,
          };
        });

        if (earnings.length > 0) {
          void setCached(`snap-earnings:${sym}`, sym, 'snap_earnings', earnings, earningsTtl(earnings));
        }
      }
    }

    // Seed the statistics cache so health-score and /statistics route get a free hit
    // (same cache key as app/api/stock/[ticker]/statistics/route.ts)
    if (statistics) {
      setCached(`stats:${sym}`, sym, 'statistics', { symbol: sym, ...statistics }, STATS_TTL).catch(() => {});
    }

    // TwelveData's /quote carries no `type` for funds (confirmed for VFIAX),
    // which left every index fund looking like a stock to the callers that route
    // and label on this field. The catalogue knows what it is.
    const resolvedType =
      instrumentType ?? instrumentTypeForKind(await getIndexedKind(sym));


    return {
      success: true,
      symbol: sym,
      quote,
      quoteConfirmedInvalid,
      statistics,
      statsFetchedAt,
      earnings,
      instrumentType: resolvedType,
    };
}
