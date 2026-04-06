/**
 * GET /api/stock/[ticker]/snapshot
 *
 * Fetches quote + statistics + earnings for a ticker in a single
 * TwelveData /batch POST instead of three separate round-trips.
 * Cost: 1 (quote) + 50 (statistics) + 20 (earnings) = 71 credits per call.
 */

import { NextRequest, NextResponse } from 'next/server';
import { batchFetch, TwelveDataRateLimitError } from '@/lib/twelvedata/twelvedata-client';
import { withRateLimit, withAuth, addSecurityHeaders } from '@/lib/security/api-security';

const APIKEY = () => process.env.TWELVE_DATA_API_KEY ?? '';

function planRestricted(msg: string) {
  return /enterprise plan|higher plan|not available.*plan/i.test(msg);
}

async function handler(
  _req: NextRequest,
  context: { params: Promise<{ ticker: string }> },
  _session: { userId: string }
): Promise<NextResponse> {
  const { ticker } = await context.params;
  const sym = ticker.toUpperCase();
  const key = APIKEY();

  try {
    const raw = await batchFetch<Record<string, unknown>>({
      quote: `/quote?symbol=${sym}&apikey=${key}`,
      statistics: `/statistics?symbol=${sym}&apikey=${key}`,
      earnings: `/earnings?symbol=${sym}&outputsize=8&apikey=${key}`,
    });

    // ---- Quote ----
    let quote: {
      price: number; change: number; changePercent: number;
      high: number; low: number; open: number; previousClose: number;
    } | null = null;

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
    }

    // ---- Statistics ----
    type Stats = Record<string, Record<string, unknown>>;
    let statistics: Stats | null = null;
    const statRaw = raw.statistics as { statistics?: Stats; code?: number; status?: string; message?: string } | undefined;
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
      } as unknown as Stats;
    } else if (statRaw?.message && planRestricted(statRaw.message)) {
      statistics = null; // plan_restricted — UI handles it
    }

    // ---- Earnings ----
    interface EarningsItem { date: string; time?: string; eps_estimate?: number | null; eps_actual?: number | null; }
    interface EarningsRaw { earnings?: EarningsItem[]; code?: number; status?: string; message?: string; }
    const earningsRaw = raw.earnings as EarningsRaw | undefined;
    let earnings: {
      date: string; time: string; epsEstimate: number | null; epsActual: number | null;
      quarter: number; year: number;
    }[] = [];
    if (earningsRaw && !earningsRaw.code && earningsRaw.status !== 'error') {
      earnings = (earningsRaw.earnings ?? []).map((e) => {
        const [yearStr, monthStr] = e.date.split('-');
        const year = parseInt(yearStr ?? '0', 10);
        const month = parseInt(monthStr ?? '0', 10);
        const quarter = month <= 3 ? 1 : month <= 6 ? 2 : month <= 9 ? 3 : 4;
        return {
          date: e.date,
          time: e.time ?? '',
          epsEstimate: e.eps_estimate ?? null,
          epsActual: e.eps_actual ?? null,
          quarter,
          year,
        };
      });
    }

    return addSecurityHeaders(
      NextResponse.json({
        success: true,
        symbol: sym,
        quote,
        statistics,
        earnings,
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
