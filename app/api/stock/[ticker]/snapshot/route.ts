/**
 * GET /api/stock/[ticker]/snapshot
 *
 * Returns quote (always live) + statistics + earnings (both server-cached 24h).
 * On a cache hit for stats+earnings, only /quote is fetched from TwelveData (1 credit).
 * On a full cache miss, all three are batched (71 credits) and stats+earnings are stored.
 */

import { NextRequest, NextResponse } from 'next/server';
import { batchFetch, withRateLimitRetry, TwelveDataRateLimitError, reportDateToFiscalQuarter } from '@/lib/twelvedata/twelvedata-client';
import { getCached, getCachedWithMeta, setCached } from '@/lib/cache/market-data-cache';
import { withRateLimit, withAuth, addSecurityHeaders } from '@/lib/security/api-security';
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

async function handler(
  _req: NextRequest,
  context: { params: Promise<{ ticker: string }> },
  _session: { userId: string }
): Promise<NextResponse> {
  const { ticker } = await context.params;
  const sym = slugToSymbol(ticker).toUpperCase();
  const assetType = inferAssetType(sym);
  const key = APIKEY();

  try {
    // Check cache for the expensive endpoints (50 + 20 credits)
    const [cachedStatsMeta, cachedEarnings] = await Promise.all([
      getCachedWithMeta<Statistics>(`snap-stats:${sym}`),
      getCached<EarningsItem[]>(`snap-earnings:${sym}`),
    ]);
    const cachedStats = cachedStatsMeta?.payload ?? null;
    let statsFetchedAt: string | null = cachedStatsMeta?.fetchedAt ?? null;

    // Build batch — always include quote (real-time); skip cached endpoints
    const requests: Record<string, string> = {
      quote: `/quote?symbol=${sym}&apikey=${key}`,
    };
    if (!cachedStats) requests.statistics = `/statistics?symbol=${sym}&apikey=${key}`;
    if (!cachedEarnings && hasEarnings(assetType)) requests.earnings = `/earnings?symbol=${sym}&outputsize=8&apikey=${key}`;

    // Retry-wrapped: a transient network blip here (common intermittently on Vercel's
    // outbound TwelveData calls) would otherwise leave quote null, which the stock page
    // treats as a signal the ticker doesn't exist for symbols with no Supabase companies row.
    const raw = await withRateLimitRetry(() => batchFetch<Record<string, unknown>>(requests));

    // ---- Quote (always fresh) ----
    let quote: {
      price: number; change: number; changePercent: number;
      high: number; low: number; open: number; previousClose: number;
    } | null = null;
    let instrumentType: string | null = null;

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
    }

    // ---- Statistics (cached or freshly fetched) ----
    let statistics: Statistics | null = cachedStats;

    if (!cachedStats) {
      const statRaw = raw.statistics as { statistics?: Statistics; code?: number; status?: string; message?: string } | undefined;
      if (statRaw && !statRaw.code && statRaw.status !== 'error' && statRaw.statistics) {
        const s = statRaw.statistics;
        const v = (s.valuations_metrics as Record<string, number>) ?? {};
        const sp = (s.stock_price_summary as Record<string, number>) ?? {};
        const ss = (s.stock_statistics as Record<string, number>) ?? {};
        const f = (s.financials as Record<string, unknown>) ?? {};
        const fi = (f.income_statement as Record<string, number>) ?? {};
        const d = (s.dividends_and_splits as Record<string, number>) ?? {};
        statistics = {
          marketCap: v.market_capitalization ?? null,
          enterpriseValue: v.enterprise_value ?? null,
          peRatioTTM: v.trailing_pe ?? null,
          peRatioForward: v.forward_pe ?? null,
          pbRatio: v.price_to_book_mrq ?? null,
          evToEbitda: v.enterprise_to_ebitda ?? null,
          beta: sp.beta ?? null,
          week52High: sp.fifty_two_week_high ?? null,
          week52Low: sp.fifty_two_week_low ?? null,
          avgVolume: ss.avg_90_volume ?? null,
          sharesFloat: ss.float_shares ?? null,
          shortRatio: ss.short_ratio ?? null,
          dividendYield: d.forward_annual_dividend_yield ?? null,
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

    // ---- Earnings (cached or freshly fetched) ----
    let earnings: EarningsItem[] = cachedEarnings ?? [];

    if (!cachedEarnings) {
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

    return addSecurityHeaders(
      NextResponse.json({
        success: true,
        symbol: sym,
        quote,
        statistics,
        statsFetchedAt,
        earnings,
        instrumentType,
      }, { headers: { 'Cache-Control': 'private, max-age=60' } })
    );
  } catch (err) {
    if (err instanceof TwelveDataRateLimitError) {
      return addSecurityHeaders(
        NextResponse.json({ success: false, error: 'Rate limit exceeded' }, { status: 429 })
      );
    }
    console.error(`[snapshot] Error for ${sym}:`, err);
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Failed to fetch snapshot' }, { status: 500 })
    );
  }
}

export const GET = withRateLimit(withAuth(handler), { windowMs: 60 * 1000, maxRequests: 120 });
