/**
 * Market Data Prefetch Cron
 * GET /api/cron/prefetch-market-data
 *
 * Runs daily at 5 AM UTC, seeding market_data_cache for all SIGNIFICANT_TICKERS
 * (~550 S&P 500 + NASDAQ 100 stocks) so watchlist enrichment, health scores, and
 * any future screener work without requiring individual stock page visits.
 *
 * Phase 1 — Stats + Earnings: all significant tickers, batched 15 at a time.
 *   Skips symbols refreshed in the last 12h (idempotent re-runs).
 *
 * Phase 2 — Financials: rotating batch of up to 75 symbols per run, prioritising
 *   those with no cached income/balance/cashflow. At 75/day the full universe
 *   rotates every ~8 days, which is fine for quarterly data.
 *
 * At 610 credits/min (Venture plan) the credit cost is not the binding constraint —
 * Vercel's maxDuration (300s) is. Phase 1 typically completes in ~60s; Phase 2 in
 * ~120s, comfortably within the window.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import {
  batchFetch,
  getIncomeStatement,
  getBalanceSheet,
  getCashFlow,
  TwelveDataRateLimitError,
} from '@/lib/twelvedata/twelvedata-client';
import { setCached } from '@/lib/cache/market-data-cache';
import { SIGNIFICANT_TICKERS } from '@/lib/market-data/significant-tickers';

export const maxDuration = 300;

const APIKEY = () => process.env.TWELVE_DATA_API_KEY ?? '';

const STATS_TTL = 24 * 60 * 60;           // 24h — price-dependent, refresh daily
const FINANCIALS_TTL = 7 * 24 * 60 * 60;  // 7 days — quarterly reports, slow-moving
const STATS_BATCH_SIZE = 15;              // symbols per batchFetch call (15 × 2 = 30 sub-requests)
const FINANCIALS_PER_RUN = 75;            // max stocks to refresh financials per invocation
const FINANCIALS_CONCURRENCY = 5;         // parallel stocks in financials phase

// ── Helpers ───────────────────────────────────────────────────────────────────

function earningsTtl(earnings: Array<{ epsActual: unknown; date: string }>): number {
  const now = Date.now();
  const next = earnings
    .filter(e => e.epsActual === null)
    .map(e => Date.parse(e.date))
    .filter(d => d > now)
    .sort((a, b) => a - b)[0];
  if (!next) return 6 * 60 * 60;
  const days = (next - now) / 86_400_000;
  if (days <= 1) return 10 * 60;
  if (days <= 3) return 30 * 60;
  return 6 * 60 * 60;
}

function intoChunks<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

type RawStats = {
  statistics?: Record<string, unknown>;
  code?: number;
  status?: string;
  message?: string;
};

type RawEarningsItem = {
  date: string;
  time?: string;
  eps_estimate?: number | null;
  eps_actual?: number | null;
};

type RawEarnings = {
  earnings?: RawEarningsItem[];
  code?: number;
  status?: string;
};

function parseStats(sym: string, raw: RawStats | undefined) {
  if (!raw || raw.code || raw.status === 'error' || !raw.statistics) return null;
  const s = raw.statistics;
  const v = (s.valuations_metrics as Record<string, number>) ?? {};
  const sp = (s.stock_price_summary as Record<string, number>) ?? {};
  const ss = (s.stock_statistics as Record<string, number>) ?? {};
  const f = (s.financials as Record<string, unknown>) ?? {};
  const fi = (f.income_statement as Record<string, number>) ?? {};
  const d = (s.dividends_and_splits as Record<string, number>) ?? {};
  return {
    symbol: sym,
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
  };
}

function buildScreenerRow(sym: string, raw: RawStats | undefined) {
  if (!raw || raw.code || raw.status === 'error' || !raw.statistics) return null;
  const s = raw.statistics;
  const v = (s.valuations_metrics as Record<string, number>) ?? {};
  const sp = (s.stock_price_summary as Record<string, number>) ?? {};
  const f = (s.financials as Record<string, unknown>) ?? {};
  const fi = ((f.income_statement ?? {}) as Record<string, number>);
  const d = (s.dividends_and_splits as Record<string, number>) ?? {};
  const revGrowth = fi.quarterly_revenue_growth;
  const earningsGrowth = fi.quarterly_earnings_growth_yoy;
  return {
    ticker: sym,
    market_cap: v.market_capitalization ? Math.round(v.market_capitalization) : null,
    pe_ratio: v.trailing_pe ?? null,
    forward_pe: v.forward_pe ?? null,
    pb_ratio: v.price_to_book_mrq ?? null,
    ps_ratio: v.price_to_sales_ttm ?? null,
    ev_to_ebitda: v.enterprise_to_ebitda ?? null,
    beta: sp.beta ?? null,
    week52_high: sp.fifty_two_week_high ?? null,
    week52_low: sp.fifty_two_week_low ?? null,
    day50_ma: sp.fifty_day_ma ?? null,
    day200_ma: sp.two_hundred_day_ma ?? null,
    dividend_yield: d.forward_annual_dividend_yield ?? null,
    payout_ratio: d.payout_ratio ?? null,
    profit_margin: (f.profit_margin as number) ?? null,
    revenue_ttm: (f.total_revenue as number) ? Math.round(f.total_revenue as number) : null,
    eps_ttm: (f.diluted_eps as number) ?? null,
    revenue_growth_yoy: revGrowth != null ? revGrowth * 100 : null,
    earnings_growth_yoy: earningsGrowth != null ? earningsGrowth * 100 : null,
    updated_at: new Date().toISOString(),
  };
}

function parseEarnings(raw: RawEarnings | undefined) {
  if (!raw || raw.code || raw.status === 'error' || !raw.earnings) return null;
  return raw.earnings.map(e => {
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

// ── Handler ───────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startMs = Date.now();
  const supabase = createServerClient();
  const key = APIKEY();
  const allSymbols = Array.from(SIGNIFICANT_TICKERS);

  const summary = {
    total: allSymbols.length,
    statsSkipped: 0,
    statsRefreshed: 0,
    earningsRefreshed: 0,
    financialsNeeded: 0,
    financialsRefreshed: 0,
    errors: [] as string[],
  };

  // ── Determine stale stats (one DB query instead of N getCached calls) ──────
  // Skip symbols whose snap_statistics was written in the last 12h — makes
  // the cron idempotent if triggered multiple times in the same day.
  const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
  const { data: recentStatsRows } = await supabase
    .from('market_data_cache')
    .select('ticker')
    .eq('data_type', 'snap_statistics')
    .gt('fetched_at', twelveHoursAgo);

  const freshSymbols = new Set((recentStatsRows ?? []).map(r => r.ticker as string));
  const needsStats = allSymbols.filter(sym => !freshSymbols.has(sym));
  summary.statsSkipped = allSymbols.length - needsStats.length;

  // Pre-load company metadata for screener_stats upsert (one query, used in Phase 1 loop)
  const { data: companyRows } = await supabase
    .from('companies')
    .select('ticker, name, sector, industry, logo_url')
    .in('ticker', allSymbols);
  const companyMap = new Map(
    (companyRows ?? []).map((c) => [c.ticker as string, c as {
      name: string; sector: string | null; industry: string | null; logo_url: string | null;
    }])
  );

  // ── Phase 1: Stats + Earnings — batched batchFetch calls ─────────────────
  let rateLimited = false;

  for (const syms of intoChunks(needsStats, STATS_BATCH_SIZE)) {
    if (rateLimited) break;
    try {
      const requests: Record<string, string> = {};
      for (const sym of syms) {
        requests[`${sym}_s`] = `/statistics?symbol=${sym}&apikey=${key}`;
        requests[`${sym}_e`] = `/earnings?symbol=${sym}&outputsize=8&apikey=${key}`;
      }

      const raw = await batchFetch<Record<string, unknown>>(requests);

      const screenerRowsBatch: Array<Record<string, unknown>> = [];
      for (const sym of syms) {
        const writes: Promise<void>[] = [];

        const stats = parseStats(sym, raw[`${sym}_s`] as RawStats | undefined);
        if (stats) {
          // Write to both cache keys — 'stats:*' is used by health-score and the
          // statistics route; 'snap-stats:*' is used by the snapshot route.
          writes.push(
            setCached(`stats:${sym}`, sym, 'statistics', stats, STATS_TTL),
            setCached(`snap-stats:${sym}`, sym, 'snap_statistics', stats, STATS_TTL),
          );
          summary.statsRefreshed++;
        }

        const earnings = parseEarnings(raw[`${sym}_e`] as RawEarnings | undefined);
        if (earnings && earnings.length > 0) {
          writes.push(
            setCached(`snap-earnings:${sym}`, sym, 'snap_earnings', earnings, earningsTtl(earnings)),
          );
          summary.earningsRefreshed++;
        }

        await Promise.all(writes);

        // Build screener row from the same raw stats for screener_stats upsert
        const screenerRow = buildScreenerRow(sym, raw[`${sym}_s`] as RawStats | undefined);
        if (screenerRow) {
          const co = companyMap.get(sym);
          screenerRowsBatch.push({
            ...screenerRow,
            name: co?.name ?? sym,
            sector: co?.sector ?? null,
            industry: co?.industry ?? null,
            logo_url: co?.logo_url ?? null,
          });
        }
      }

      // Upsert all parsed stats for this batch into screener_stats
      if (screenerRowsBatch.length > 0) {
        await supabase
          .from('screener_stats')
          .upsert(screenerRowsBatch, { onConflict: 'ticker' });
      }
    } catch (err) {
      if (err instanceof TwelveDataRateLimitError) {
        rateLimited = true;
        break;
      }
      const msg = err instanceof Error ? err.message : String(err);
      summary.errors.push(`stats-batch[${syms[0]}…]: ${msg}`);
    }
  }

  if (rateLimited) {
    return NextResponse.json({
      success: true,
      partial: true,
      rateLimited: true,
      durationMs: Date.now() - startMs,
      ...summary,
    });
  }

  // ── Determine which symbols need financials (one DB query) ────────────────
  // Use the income statement as a proxy: if it exists and isn't expired, all
  // three statements (income / balance / cashflow) were written together.
  const { data: existingFinRows } = await supabase
    .from('market_data_cache')
    .select('ticker')
    .eq('data_type', 'financials')
    .like('cache_key', '%:income:quarterly')
    .gt('expires_at', new Date().toISOString());

  const cachedFinSymbols = new Set((existingFinRows ?? []).map(r => r.ticker as string));
  const needsFinancials = allSymbols.filter(sym => !cachedFinSymbols.has(sym));
  summary.financialsNeeded = needsFinancials.length;

  const toProcess = needsFinancials.slice(0, FINANCIALS_PER_RUN);

  // ── Phase 2: Financials — 5 symbols at a time, income+balance+cashflow in
  //    parallel per symbol ────────────────────────────────────────────────────
  for (const syms of intoChunks(toProcess, FINANCIALS_CONCURRENCY)) {
    const results = await Promise.allSettled(
      syms.map(async sym => {
        const [income, balance, cashflow] = await Promise.all([
          getIncomeStatement(sym, 'quarterly'),
          getBalanceSheet(sym, 'quarterly'),
          getCashFlow(sym, 'quarterly'),
        ]);
        await Promise.all([
          setCached(`financials:${sym}:income:quarterly`, sym, 'financials', income, FINANCIALS_TTL),
          setCached(`financials:${sym}:balance:quarterly`, sym, 'financials', balance, FINANCIALS_TTL),
          setCached(`financials:${sym}:cashflow:quarterly`, sym, 'financials', cashflow, FINANCIALS_TTL),
        ]);
        summary.financialsRefreshed++;
      })
    );

    if (results.some(r => r.status === 'rejected' && r.reason instanceof TwelveDataRateLimitError)) {
      break;
    }

    for (const [i, r] of results.entries()) {
      if (r.status === 'rejected') {
        const msg = r.reason instanceof Error ? r.reason.message : String(r.reason);
        if (!/enterprise plan|higher plan|not available/i.test(msg)) {
          summary.errors.push(`financials:${syms[i]}: ${msg}`);
        }
      }
    }
  }

  return NextResponse.json({
    success: true,
    durationMs: Date.now() - startMs,
    ...summary,
  });
}
