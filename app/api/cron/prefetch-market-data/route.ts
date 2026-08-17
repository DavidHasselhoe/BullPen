/**
 * Market Data Prefetch Cron
 * GET /api/cron/prefetch-market-data?phase=stats&batch=N
 * GET /api/cron/prefetch-market-data?phase=financials&batch=N
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
 * phase=financials&batch=N — one symbol needing income/balance/cashflow per
 *   call. Each of those three endpoints actually costs ~101 credits on this
 *   plan regardless of outputsize/period (confirmed live against TwelveData's
 *   /api_usage endpoint on 2026-08-04 — NOT the ~1 credit assumed by
 *   CLAUDE.md's cost table, which describes the Basic-plan-style flat rate,
 *   not this plan's full-history fundamentals pricing). That's ~303
 *   credits/symbol, so unlike /statistics+/earnings this can't be batched
 *   5-at-a-time; one symbol already uses most of the shared 400-credit cron
 *   budget. Previously ran as a single unguarded pass over up to 75 symbols
 *   (assumed "~225 credits worst case"), which in reality could reserve nothing
 *   and fire up to 75 x 303 = ~22,725 credits with no pacing — the single
 *   biggest contributor to the multi-thousand-credit-per-minute spikes seen
 *   on the TwelveData dashboard. Now paced like phase=stats: one guarded
 *   batch per GitHub Actions loop iteration, 65s apart.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import { logSecurityEvent } from '@/lib/security/security-events';
import {
  batchFetch,
  getIncomeStatement,
  getBalanceSheet,
  getCashFlow,
  getCompanyProfile,
  withRateLimitRetry,
  TwelveDataRateLimitError,
  reportDateToFiscalQuarter,
} from '@/lib/twelvedata/twelvedata-client';
import { getCached, setCached } from '@/lib/cache/market-data-cache';
import { SIGNIFICANT_TICKERS } from '@/lib/market-data/significant-tickers';
import { getActiveUniverse } from '@/lib/market-data/screener-universe';
import { waitForCronCreditBudget } from '@/lib/twelvedata/credit-budget';

export const maxDuration = 60;

const APIKEY = () => process.env.TWELVE_DATA_API_KEY ?? '';

const STATS_TTL = 24 * 60 * 60;           // 24h — price-dependent, refresh daily
const FINANCIALS_TTL = 7 * 24 * 60 * 60;  // 7 days — quarterly reports, slow-moving
const PROFILE_TTL = 7 * 24 * 60 * 60;     // 7 days — sector/industry/name change essentially never
const STATS_BATCH_SIZE = 5;               // symbols per batch (5 × 70 credits ≈ 350/call)
/** /statistics (~50 credits/symbol) + /earnings (20 credits/symbol), reserved
 *  worst-case per symbol before firing — same shared per-minute budget
 *  screener/refresh reserves against, so the two crons can't stack past the
 *  610/min plan cap if their schedules ever land in the same wall-clock minute. */
const CREDITS_PER_SYMBOL = 70;
const FINANCIALS_BATCH_SIZE = 1;          // symbols per call — see phase=financials doc above for why this can't be 5 like stats
/** /income_statement + /balance_sheet + /cash_flow, ~101 credits each measured
 *  live (see phase=financials doc above) — reserved worst-case per symbol
 *  before firing, against the same shared budget as the stats phase. */
const CREDITS_PER_FINANCIALS_SYMBOL = 303;

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

type RawStats = {
  meta?: { symbol?: string; name?: string; currency?: string; exchange?: string };
  statistics?: Record<string, unknown>;
  code?: number;
  status?: string;
  message?: string;
};

/**
 * Equity /statistics and /profile requests are always for USD-listed companies —
 * this sweep only ever runs over SIGNIFICANT_TICKERS (S&P 500 + Nasdaq 100). But
 * TwelveData resolves an uncovered/ambiguous ticker to whatever foreign listing
 * shares that symbol string (e.g. "CTRA" -> Ciputra Development, an Indonesian
 * stock, not Coterra Energy) without erroring — see the same guard in
 * screener-stats.ts and twelvedata-client.ts's parseQuoteResponse. A non-USD
 * currency means we got the wrong company's data entirely.
 */
function isForeignListing(currency: string | undefined): boolean {
  return !!currency && currency !== 'USD';
}

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

/**
 * Sector/industry/name/logo for a screener_stats row. Sourced from TwelveData's
 * /profile — NOT the `companies` table, which is scoped to SEC-filing-ingested
 * companies (requires a real CIK) and only covers a small hand-ingested subset,
 * nowhere near the ~530-stock SIGNIFICANT_TICKERS universe this cron sweeps.
 * Shares the same 7-day cache key the stock page's own profile route writes
 * (`profile:${sym}`), so an organic page visit and this cron reuse one fetch.
 */
async function getProfileFields(
  sym: string
): Promise<{ name: string | null; sector: string | null; industry: string | null; logoUrl: string | null }> {
  const cacheKey = `profile:${sym}`;
  const cached = await getCached<{ profile: Awaited<ReturnType<typeof getCompanyProfile>> }>(cacheKey);
  if (cached?.profile) {
    const p = cached.profile;
    return { name: p.name ?? null, sector: p.sector ?? null, industry: p.industry ?? null, logoUrl: p.logo ?? null };
  }
  try {
    const profile = await withRateLimitRetry(() => getCompanyProfile(sym));
    // Same symbol-collision risk as the /statistics fetch (see isForeignListing) —
    // don't cache or return another company's identity under our ticker.
    if (isForeignListing(profile.currency)) {
      console.warn(
        `[prefetch] skipping profile for ${sym}: TwelveData resolved it to "${profile.name}" ` +
        `(${profile.exchange}, ${profile.currency}) instead of a USD-listed company`
      );
      return { name: null, sector: null, industry: null, logoUrl: null };
    }
    void setCached(cacheKey, sym, 'company_profile', { profile, executives: [] }, PROFILE_TTL);
    return { name: profile.name ?? null, sector: profile.sector ?? null, industry: profile.industry ?? null, logoUrl: profile.logo ?? null };
  } catch {
    return { name: null, sector: null, industry: null, logoUrl: null };
  }
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

  const profileEntries = await Promise.all(
    needsStats.map(async (sym) => [sym, await getProfileFields(sym)] as const)
  );
  const profileMap = new Map(profileEntries);

  try {
    await waitForCronCreditBudget(needsStats.length * CREDITS_PER_SYMBOL);

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
      const statsRaw = raw[`${sym}_s`] as RawStats | undefined;

      // Skip the whole symbol this cycle rather than persist another company's
      // stats/earnings under our ticker — see isForeignListing above.
      if (statsRaw?.meta && isForeignListing(statsRaw.meta.currency)) {
        console.warn(
          `[prefetch] skipping ${sym}: TwelveData resolved it to "${statsRaw.meta.name}" ` +
          `(${statsRaw.meta.exchange}, ${statsRaw.meta.currency}) instead of a USD-listed company`
        );
        continue;
      }

      const writes: Promise<void>[] = [];

      const stats = parseStats(sym, statsRaw);
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

      const screenerRow = buildScreenerRow(sym, statsRaw);
      if (screenerRow) {
        const profile = profileMap.get(sym);
        screenerRowsBatch.push({
          ...screenerRow,
          name: profile?.name ?? sym,
          sector: profile?.sector ?? null,
          industry: profile?.industry ?? null,
          logo_url: profile?.logoUrl ?? null,
        });
      }
    }

    if (screenerRowsBatch.length > 0) {
      await supabase.from('screener_stats').upsert(screenerRowsBatch, { onConflict: 'ticker' });
    }

    // Recompute the per-sector and per-industry benchmark medians (migrations
    // 087/088) off screener_stats. Pure SQL aggregation — no market-data credits.
    //
    // Runs on EVERY batch, not just the last one. Gating this on the final batch
    // meant a single transient failure anywhere in the ~107-batch sweep — which
    // cron-prefetch-market-data.yml deliberately `break`s on — left the rollups
    // untouched for the whole day. That's how sector_metric_stats ended up with
    // 2 buckets instead of 11 and industry_metric_stats ended up empty, silently
    // degrading every "typical for its sector" comparison in the app.
    //
    // Running it per batch is safe: the sweep upserts into screener_stats rather
    // than truncating it, so the table is always fully populated and a partial
    // sweep still yields correct medians — just computed from slightly older
    // rows for the symbols this run hasn't reached yet. Each call is one
    // aggregate over ~3k rows, so the cost is noise next to the batch's own I/O.
    //
    // Fire-and-forget: a failure here must never fail the sweep.
    const { error: refreshErr } = await supabase.rpc('refresh_sector_metric_stats');
    if (refreshErr) {
      console.error('[prefetch] refresh_sector_metric_stats failed:', refreshErr.message);
    }
    const { error: refreshIndustryErr } = await supabase.rpc('refresh_industry_metric_stats');
    if (refreshIndustryErr) {
      console.error('[prefetch] refresh_industry_metric_stats failed:', refreshIndustryErr.message);
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

// ── Phase: financials (one guarded symbol per batch — see doc comment above) ──

async function handleFinancials(
  supabase: ReturnType<typeof createServerClient>,
  allSymbols: string[],
  batchIndex: number
): Promise<NextResponse> {
  // Paginate explicitly: PostgREST caps an unbounded select at 1000 rows, and
  // the warmed set is now larger than that (the full screener universe, ~1200+
  // tickers). Silently truncating this list would make already-warm symbols
  // look cold and re-fetch them at 303 credits each.
  const cachedFinSymbols = new Set<string>();
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data: page } = await supabase
      .from('market_data_cache')
      .select('ticker')
      .eq('data_type', 'financials')
      .like('cache_key', '%:income:quarterly')
      .gt('expires_at', new Date().toISOString())
      .range(from, from + PAGE - 1);
    for (const r of page ?? []) cachedFinSymbols.add(r.ticker as string);
    if (!page || page.length < PAGE) break;
  }

  const needsFinancials = allSymbols.filter(sym => !cachedFinSymbols.has(sym));
  const remaining = needsFinancials.length;

  if (remaining === 0) {
    return NextResponse.json({
      success: true,
      phase: 'financials',
      batch: batchIndex,
      totalBatches: 0,
      financialsRefreshed: 0,
      done: true,
    });
  }

  // Self-consuming: always take from the head of the "still needs warming"
  // list rather than indexing into it by batch number. Each completed batch
  // drops its symbol out of that list before the next call recomputes it, so
  // slicing at batchIndex skipped one extra symbol per iteration and then
  // reported done early — batch 0 warmed the 1st symbol, batch 1 the 3rd,
  // batch 2 the 5th, and the run ended at the halfway point with most of the
  // universe never warmed. Harmless while screener-stats was also fetching
  // financials live; not harmless now that this phase is the only writer.
  const syms = needsFinancials.slice(0, FINANCIALS_BATCH_SIZE);
  const nextBatch = remaining > syms.length ? batchIndex + 1 : null;
  const totalBatches = remaining;

  try {
    await waitForCronCreditBudget(syms.length * CREDITS_PER_FINANCIALS_SYMBOL);

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
      })
    );

    const errors: string[] = [];
    let financialsRefreshed = 0;
    for (const [i, r] of results.entries()) {
      if (r.status === 'fulfilled') {
        financialsRefreshed++;
      } else {
        const msg = r.reason instanceof Error ? r.reason.message : String(r.reason);
        if (!/enterprise plan|higher plan|not available/i.test(msg)) {
          errors.push(`financials:${syms[i]}: ${msg}`);
        }
      }
    }

    return NextResponse.json({
      success: true,
      phase: 'financials',
      batch: batchIndex,
      totalBatches,
      financialsRefreshed,
      errors,
      nextBatch,
      done: nextBatch === null,
    });
  } catch (err) {
    if (err instanceof TwelveDataRateLimitError) {
      return NextResponse.json(
        { success: false, phase: 'financials', batch: batchIndex, totalBatches, error: 'rate_limited' },
        { status: 429 }
      );
    }
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { success: false, phase: 'financials', batch: batchIndex, totalBatches, error: msg },
      { status: 500 }
    );
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    logSecurityEvent('cron_secret_mismatch', { path: '/api/cron/prefetch-market-data' });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServerClient();
  const allSymbols = Array.from(SIGNIFICANT_TICKERS);
  const sp = request.nextUrl.searchParams;
  const phase = sp.get('phase') === 'financials' ? 'financials' : 'stats';
  const batchIndex = parseInt(sp.get('batch') ?? '0', 10);

  if (phase === 'financials') {
    // This phase is the only thing in the app that fetches income/balance/
    // cash-flow across many symbols, so it has to cover everything that reads
    // those cache keys — not just SIGNIFICANT_TICKERS. lib/market-data/
    // screener-stats.ts computes health scores for the whole tier-1 screener
    // universe straight out of this cache and never fetches on its own (doing
    // so is what caused the repeated 610/min breaches), so any ticker this
    // phase skips is a ticker whose health score can never refresh.
    const universe = await getActiveUniverse();
    const financialsSymbols = [...new Set([...allSymbols, ...universe])];
    return handleFinancials(supabase, financialsSymbols, batchIndex);
  }

  return handleStatsBatch(supabase, APIKEY(), allSymbols, batchIndex);
}
