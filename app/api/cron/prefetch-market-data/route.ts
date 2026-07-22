/**
 * Market Data Prefetch Cron
 * GET /api/cron/prefetch-market-data?phase=stats&batch=N
 * GET /api/cron/prefetch-market-data?phase=financials
 *
 * Seeds market_data_cache (+ screener_stats) for all SIGNIFICANT_TICKERS
 * (~530 S&P 500 + NASDAQ 100 stocks) so watchlist enrichment, health scores,
 * and any future screener work run without requiring individual stock page
 * visits.
 *
 * phase=stats — one batch (STATS_BATCH_SIZE symbols) of /statistics +
 *   /earnings per call. A single batch costs ~5 × 70 = 350 credits, comfortably
 *   under the 610/min plan cap on its own. The GitHub Actions workflow calls
 *   this once per `batch` index with a ~75s sleep between calls (see
 *   .github/workflows/cron-prefetch-market-data.yml), which keeps the
 *   *sustained* rate around ~280 credits/min — well under the cap, leaving
 *   real headroom for concurrent live user traffic for the ~2h the sweep
 *   takes. Symbol→batch mapping is computed off the stable SIGNIFICANT_TICKERS
 *   order (not the shrinking "needs refresh" list), so batch indices stay
 *   valid across the whole run even as earlier batches write fresh data.
 *   Freshness (skip if refreshed in the last 12h) is checked per-batch on
 *   just that batch's symbols, so re-running the workflow mid-day is cheap.
 *
 * phase=financials — up to 75 symbols needing income/balance/cashflow
 *   (1 credit each = ~225 credits worst case), run as a single call. Cheap
 *   enough not to need batching; kept as-is from the previous single-pass
 *   design.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import {
  batchFetch,
  getIncomeStatement,
  getBalanceSheet,
  getCashFlow,
  TwelveDataRateLimitError,
  reportDateToFiscalQuarter,
} from '@/lib/twelvedata/twelvedata-client';
import { setCached } from '@/lib/cache/market-data-cache';
import { SIGNIFICANT_TICKERS } from '@/lib/market-data/significant-tickers';

export const maxDuration = 60;

const APIKEY = () => process.env.TWELVE_DATA_API_KEY ?? '';

const STATS_TTL = 24 * 60 * 60;           // 24h — price-dependent, refresh daily
const FINANCIALS_TTL = 7 * 24 * 60 * 60;  // 7 days — quarterly reports, slow-moving
const STATS_BATCH_SIZE = 5;               // symbols per batch (5 × 70 credits ≈ 350/call)
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
}

// ── Phase: stats + earnings (one batch) ────────────────────────────────────

async function handleStatsBatch(
  supabase: ReturnType<typeof createServerClient>,
  key: string,
  allSymbols: string[],
  batchIndex: number
): Promise<NextResponse> {
  const totalBatches = Math.ceil(allSymbols.length / STATS_BATCH_SIZE);

  if (batchIndex < 0 || batchIndex >= totalBatches) {
    return NextResponse.json({
      success: true,
      phase: 'stats',
      batch: batchIndex,
      totalBatches,
      refreshed: 0,
      earningsRefreshed: 0,
      done: true,
    });
  }

  const syms = allSymbols.slice(batchIndex * STATS_BATCH_SIZE, (batchIndex + 1) * STATS_BATCH_SIZE);
  const nextBatch = batchIndex + 1 < totalBatches ? batchIndex + 1 : null;

  // Freshness check scoped to just this batch's symbols — cheap, and immune
  // to earlier batches in the same run shrinking a shared "needs refresh" list.
  const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
  const { data: recentStatsRows } = await supabase
    .from('market_data_cache')
    .select('ticker')
    .eq('data_type', 'snap_statistics')
    .in('ticker', syms)
    .gt('fetched_at', twelveHoursAgo);

  const freshSymbols = new Set((recentStatsRows ?? []).map(r => r.ticker as string));
  const needsStats = syms.filter(sym => !freshSymbols.has(sym));

  if (needsStats.length === 0) {
    return NextResponse.json({
      success: true,
      phase: 'stats',
      batch: batchIndex,
      totalBatches,
      refreshed: 0,
      earningsRefreshed: 0,
      skipped: syms.length,
      nextBatch,
      done: nextBatch === null,
    });
  }

  const { data: companyRows } = await supabase
    .from('companies')
    .select('ticker, name, sector, industry, logo_url')
    .in('ticker', needsStats);
  const companyMap = new Map(
    (companyRows ?? []).map((c) => [c.ticker as string, c as {
      name: string; sector: string | null; industry: string | null; logo_url: string | null;
    }])
  );

  try {
    const requests: Record<string, string> = {};
    for (const sym of needsStats) {
      requests[`${sym}_s`] = `/statistics?symbol=${sym}&apikey=${key}`;
      requests[`${sym}_e`] = `/earnings?symbol=${sym}&outputsize=8&apikey=${key}`;
    }

    const raw = await batchFetch<Record<string, unknown>>(requests);

    let statsRefreshed = 0;
    let earningsRefreshed = 0;
    const screenerRowsBatch: Array<Record<string, unknown>> = [];

    for (const sym of needsStats) {
      const writes: Promise<void>[] = [];

      const stats = parseStats(sym, raw[`${sym}_s`] as RawStats | undefined);
      if (stats) {
        writes.push(
          setCached(`stats:${sym}`, sym, 'statistics', stats, STATS_TTL),
          setCached(`snap-stats:${sym}`, sym, 'snap_statistics', stats, STATS_TTL),
        );
        statsRefreshed++;
      }

      const earnings = parseEarnings(raw[`${sym}_e`] as RawEarnings | undefined);
      if (earnings && earnings.length > 0) {
        writes.push(
          setCached(`snap-earnings:${sym}`, sym, 'snap_earnings', earnings, earningsTtl(earnings)),
        );
        earningsRefreshed++;
      }

      await Promise.all(writes);

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

    if (screenerRowsBatch.length > 0) {
      await supabase.from('screener_stats').upsert(screenerRowsBatch, { onConflict: 'ticker' });
    }

    // After the final batch of the sweep, recompute the per-sector benchmark
    // medians (migration 087) off the now-fresh screener_stats. Pure SQL
    // aggregation — no market-data credits. Fire-and-forget: a failure here must
    // never fail the sweep, and stale benchmarks are harmless (the UI just shows
    // yesterday's "typical" context).
    if (nextBatch === null) {
      const { error: refreshErr } = await supabase.rpc('refresh_sector_metric_stats');
      if (refreshErr) {
        console.error('[prefetch] refresh_sector_metric_stats failed:', refreshErr.message);
      }
    }

    return NextResponse.json({
      success: true,
      phase: 'stats',
      batch: batchIndex,
      totalBatches,
      refreshed: statsRefreshed,
      earningsRefreshed,
      nextBatch,
      done: nextBatch === null,
    });
  } catch (err) {
    if (err instanceof TwelveDataRateLimitError) {
      return NextResponse.json(
        { success: false, phase: 'stats', batch: batchIndex, totalBatches, error: 'rate_limited' },
        { status: 429 }
      );
    }
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { success: false, phase: 'stats', batch: batchIndex, totalBatches, error: msg },
      { status: 500 }
    );
  }
}

// ── Phase: financials (single pass — cheap, ~1 credit/statement) ───────────

async function handleFinancials(
  supabase: ReturnType<typeof createServerClient>,
  allSymbols: string[]
): Promise<NextResponse> {
  const summary = {
    financialsNeeded: 0,
    financialsRefreshed: 0,
    errors: [] as string[],
    rateLimited: false,
  };

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
      summary.rateLimited = true;
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

  return NextResponse.json({ success: true, phase: 'financials', ...summary });
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServerClient();
  const allSymbols = Array.from(SIGNIFICANT_TICKERS);
  const sp = request.nextUrl.searchParams;
  const phase = sp.get('phase') === 'financials' ? 'financials' : 'stats';

  if (phase === 'financials') {
    return handleFinancials(supabase, allSymbols);
  }

  const batchIndex = parseInt(sp.get('batch') ?? '0', 10);
  return handleStatsBatch(supabase, APIKEY(), allSymbols, batchIndex);
}
