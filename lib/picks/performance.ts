/**
 * Bull's Weekly Pick — track-record computation.
 *
 * THE CHART MATH
 * The naive version of this chart — plot the portfolio's total value as picks
 * accumulate — rises simply because cash keeps being added, which would make a
 * losing record look like a winning one. Instead we chart a cumulative RETURN
 * index, where each pick's notional $100 enters both the value and the cost
 * basis on its own entry date:
 *
 *   contributed(D) = 100 × (picks whose entry date <= D)
 *   value(D)       = Σ 100 × price_p(D) / entry_p
 *   returnPct(D)   = (value(D) / contributed(D) − 1) × 100
 *
 * The benchmark runs the identical schedule — $100 into SPY on each pick's own
 * entry date — so it answers "would you have done better just buying the index
 * on the same days?", which is the only comparison that isn't flattering by
 * construction.
 *
 * THE ENTRY PRICE
 * A pick's entry is the OPEN of the first regular session on or after its pick
 * date. The pick publishes pre-market, so that open is the first price a reader
 * could actually have paid, and it's verifiable on any public chart. It's
 * stamped exactly once, here, from candle data we're fetching anyway — and the
 * database trigger from migration 093 rejects any later attempt to change it.
 *
 * Nothing in this module can exclude a pick from the aggregate. A losing pick
 * is in the numbers for as long as the feature exists.
 */

import { createServerClient } from '@/lib/supabase/client';
import {
  getStockCandles,
  getStockQuotes,
  withRateLimitRetry,
  type StockCandles,
} from '@/lib/twelvedata/twelvedata-client';
import { getCached, setCached } from '@/lib/cache/market-data-cache';
import { getMarketSession } from '@/lib/cache/redis-cache';
import {
  MIN_PICKS_FOR_HEADLINE,
  type PerformanceResponse,
  type PerformanceSummary,
  type PickWithPerformance,
  type SeriesPoint,
} from './types';
import { buildNormalized, buildSeries, type SeriesPick } from './series-math';
import { coerceRowNumerics, rowToSummary, type PickRow, PICK_SUMMARY_COLUMNS } from './picks-db';

const BENCHMARK_SYMBOL = 'SPY';
/** Daily bars change once a day; 6 h keeps the history cheap without going stale. */
const CANDLE_TTL_SECONDS = 6 * 60 * 60;

/** ET calendar date of a candle timestamp. Daily bars land on ET midnight. */
function toETDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

// ─── Candle loading ──────────────────────────────────────────────────────────

/**
 * Calendar days of slack on the front of the candle window.
 *
 * Without it, a window starting exactly on the first pick date contains no
 * trading sessions at all until that pick's first session closes — TwelveData
 * answers "No data is available on the specified dates" and the whole track
 * record goes dark over the weekend a first pick is published. The extra days
 * cost nothing (same one credit) and the surplus dates are filtered back off
 * the axis, so they never reach the chart.
 */
const WINDOW_PAD_DAYS = 10;

/**
 * Daily candles for one symbol from `fromDate` to today, cache-first.
 * The cache key includes fromDate so it stays stable week to week (the earliest
 * pick date only changes if picks are added *before* the current oldest, which
 * can't happen) and a new key is minted the day a new oldest pick appears.
 */
async function loadCandles(symbol: string, fromDate: string): Promise<StockCandles | null> {
  const key = `picks:candles:${symbol}:${fromDate}`;
  const cached = await getCached<StockCandles>(key);
  if (cached) return cached;

  try {
    const from = Math.floor(
      (new Date(`${fromDate}T00:00:00Z`).getTime() - WINDOW_PAD_DAYS * 86_400_000) / 1000,
    );
    const to = Math.floor(Date.now() / 1000);
    const candles = await withRateLimitRetry(() => getStockCandles(symbol, from, to, 'D'));
    if (candles.s === 'no_data' || candles.t.length === 0) return null;
    void setCached(key, symbol, 'candles', candles, CANDLE_TTL_SECONDS).catch(() => {});
    return candles;
  } catch (err) {
    console.error(`[picks/performance] candle fetch failed for ${symbol}:`, err);
    return null;
  }
}

interface DailyBars {
  /** ET date → index into the candle arrays. */
  indexByDate: Map<string, number>;
  /** ET dates, ascending. */
  dates: string[];
  open: number[];
  close: number[];
}

function toDailyBars(candles: StockCandles): DailyBars {
  const indexByDate = new Map<string, number>();
  const dates: string[] = [];
  for (let i = 0; i < candles.t.length; i++) {
    const d = toETDate(candles.t[i]);
    // A duplicate date (shouldn't happen on daily bars) keeps the later entry.
    if (!indexByDate.has(d)) dates.push(d);
    indexByDate.set(d, i);
  }
  return { indexByDate, dates, open: candles.o, close: candles.c };
}

/**
 * Forward-fill a symbol's closes onto a shared date axis. A day the symbol
 * didn't trade (halt, holiday mismatch) carries the previous close rather than
 * dropping out of the portfolio — which is what actually happens to a holder.
 * Returns null for dates before the symbol's first bar.
 */
function alignToAxis(bars: DailyBars, axis: string[]): Array<number | null> {
  const out: Array<number | null> = new Array(axis.length).fill(null);
  let last: number | null = null;
  for (let i = 0; i < axis.length; i++) {
    const idx = bars.indexByDate.get(axis[i]);
    if (idx !== undefined) last = bars.close[idx];
    out[i] = last;
  }
  return out;
}

// ─── Entry stamping ──────────────────────────────────────────────────────────

interface StampablePick {
  pickDate: string;
  symbol: string;
  entryPrice: number | null;
  benchmarkEntryPrice: number | null;
}

/**
 * Fill in `entry_price` / `benchmark_entry_price` for any pick whose first
 * session has now opened. Write-once: the trigger in migration 093 raises if
 * this ever tries to restate an existing value, so a bug here fails loudly
 * rather than silently rewriting history.
 *
 * Returns the picks with entry prices applied in memory, so the caller doesn't
 * need to re-read the table.
 */
async function stampMissingEntries(
  picks: StampablePick[],
  barsBySymbol: Map<string, DailyBars>,
  benchmarkBars: DailyBars | null
): Promise<void> {
  const pending = picks.filter((p) => p.entryPrice == null);
  if (pending.length === 0 || !benchmarkBars) return;

  const supabase = createServerClient();

  for (const pick of pending) {
    const bars = barsBySymbol.get(pick.symbol);
    if (!bars) continue;

    // First session on or after the pick date, for BOTH the stock and SPY.
    // Requiring both keeps the pair consistent — a pick can never be measured
    // against a benchmark entry from a different day.
    const stockDate = bars.dates.find((d) => d >= pick.pickDate);
    const benchDate = benchmarkBars.dates.find((d) => d >= pick.pickDate);
    if (!stockDate || !benchDate || stockDate !== benchDate) continue;

    const stockOpen = bars.open[bars.indexByDate.get(stockDate)!];
    const benchOpen = benchmarkBars.open[benchmarkBars.indexByDate.get(benchDate)!];
    if (!Number.isFinite(stockOpen) || !Number.isFinite(benchOpen) || stockOpen <= 0 || benchOpen <= 0) continue;

    const { error } = await supabase
      .from('ai_stock_picks')
      // `as never`: the generated Database type here doesn't carry this table.
      .update({ entry_price: stockOpen, benchmark_entry_price: benchOpen } as never)
      .eq('pick_date', pick.pickDate)
      .is('entry_price', null);   // belt-and-braces alongside the trigger

    if (error) {
      console.error(`[picks/performance] entry stamp failed for ${pick.symbol}:`, error.message);
      continue;
    }

    pick.entryPrice = stockOpen;
    pick.benchmarkEntryPrice = benchOpen;
  }
}

// ─── Main computation ────────────────────────────────────────────────────────

export async function computePerformance(): Promise<PerformanceResponse> {
  const supabase = createServerClient();

  const { data: rows, error } = await supabase
    .from('ai_stock_picks')
    .select(PICK_SUMMARY_COLUMNS)
    .order('pick_date', { ascending: true })
    .returns<PickRow[]>();

  if (error) throw new Error(`Failed to load picks: ${error.message}`);

  // PostgREST hands NUMERIC back as strings — normalize before any arithmetic.
  const picks = (rows ?? []).map(coerceRowNumerics);
  if (picks.length === 0) return emptyResponse();

  const firstPickDate = picks[0].pick_date;
  const symbols = [...new Set(picks.map((p) => p.symbol))];

  // ── Load history ──────────────────────────────────────────────────────────
  const [benchmarkCandles, ...symbolCandles] = await Promise.all([
    loadCandles(BENCHMARK_SYMBOL, firstPickDate),
    ...symbols.map((s) => loadCandles(s, firstPickDate)),
  ]);

  const benchmarkBars = benchmarkCandles ? toDailyBars(benchmarkCandles) : null;
  const barsBySymbol = new Map<string, DailyBars>();
  symbols.forEach((s, i) => {
    const c = symbolCandles[i];
    if (c) barsBySymbol.set(s, toDailyBars(c));
  });

  // ── Stamp any entry prices that have become knowable ──────────────────────
  const stampable: StampablePick[] = picks.map((p) => ({
    pickDate: p.pick_date,
    symbol: p.symbol,
    entryPrice: p.entry_price,
    benchmarkEntryPrice: p.benchmark_entry_price,
  }));
  await stampMissingEntries(stampable, barsBySymbol, benchmarkBars);
  stampable.forEach((s, i) => {
    picks[i].entry_price = s.entryPrice;
    picks[i].benchmark_entry_price = s.benchmarkEntryPrice;
  });

  // ── Live prices for the headline figures ──────────────────────────────────
  // Candles are cached for 6 h; the numbers a user reads at the top of the page
  // shouldn't be. One batched /quote covers every pick plus the benchmark.
  const quotes = await withRateLimitRetry(() => getStockQuotes([...symbols, BENCHMARK_SYMBOL]))
    .catch(() => new Map());

  const picksWithPerf = buildPickPerformance(picks, quotes, barsBySymbol, benchmarkBars);

  if (!benchmarkBars) {
    // No benchmark history — still return the per-pick numbers rather than
    // failing the whole page.
    return {
      series: [],
      normalized: [],
      summary: summarize(picksWithPerf, [], firstPickDate),
      picks: picksWithPerf,
    };
  }

  // ── Shared date axis: every US session since the first pick ───────────────
  const axis = benchmarkBars.dates.filter((d) => d >= firstPickDate);
  const benchmarkCloses = alignToAxis(benchmarkBars, axis);

  const working: SeriesPick[] = [];
  for (const row of picks) {
    if (row.entry_price == null || row.benchmark_entry_price == null) continue;  // entry pending
    const bars = barsBySymbol.get(row.symbol);
    if (!bars) continue;

    // The entry date is the first session on/after the pick date, which is
    // exactly the day the entry price came from.
    const entryDate = bars.dates.find((d) => d >= row.pick_date);
    if (!entryDate) continue;
    const entryIndex = axis.indexOf(entryDate);
    if (entryIndex === -1) continue;

    working.push({
      entryPrice: row.entry_price,
      benchmarkEntryPrice: row.benchmark_entry_price,
      entryIndex,
      closes: alignToAxis(bars, axis),
      closePrice: row.status === 'closed' ? row.close_price : null,
      closeDate: row.status === 'closed' ? row.close_date : null,
    });
  }

  const series = buildSeries(working, axis, benchmarkCloses);
  const normalized = buildNormalized(working, axis);
  const summary = summarize(picksWithPerf, series, firstPickDate);

  return { series, normalized, summary, picks: picksWithPerf };
}

/**
 * Price of a pick on axis index `i`, honouring a closed position: once a pick
 * is closed (the security stopped trading), it holds flat at its close price
 * instead of vanishing from the portfolio.
 */
// ─── Per-pick + summary ──────────────────────────────────────────────────────

interface QuoteLike { c: number }

function lastDailyClose(bars: DailyBars | null | undefined): number | null {
  return bars && bars.close.length > 0 ? bars.close[bars.close.length - 1] : null;
}

function buildPickPerformance(
  rows: PickRow[],
  quotes: Map<string, QuoteLike>,
  barsBySymbol: Map<string, DailyBars>,
  benchmarkBars: DailyBars | null
): PickWithPerformance[] {
  // Outside an active session (the closed window before pre-market opens, or a
  // weekend) there's nothing live to show — the correct "current" price is
  // just the prior session's close. Go straight to the daily bar for that
  // instead of routing through the live /quote endpoint, which has a known
  // dead-window gap right before the first pre-market trade posts (see
  // parseQuoteResponse). During an active session the quote is still preferred
  // since it's fresher than a once-a-day bar.
  const marketClosed = getMarketSession() === 'closed';

  const spyQuote = quotes.get(BENCHMARK_SYMBOL);
  const spyQuotePrice = spyQuote && Number.isFinite(spyQuote.c) && spyQuote.c > 0 ? spyQuote.c : null;
  const spyPrice = !marketClosed && spyQuotePrice != null
    ? spyQuotePrice
    : lastDailyClose(benchmarkBars) ?? spyQuotePrice;

  return rows
    .map((row) => {
      const summary = rowToSummary(row);

      // A closed pick is frozen at its close price. Otherwise prefer the live
      // quote during market hours; once the market is closed, or if the quote
      // is simply missing, fall back to the last daily close.
      let currentPrice: number | null = null;
      if (row.status === 'closed' && row.close_price != null) {
        currentPrice = row.close_price;
      } else {
        const q = quotes.get(row.symbol);
        const quotePrice = q && Number.isFinite(q.c) && q.c > 0 ? q.c : null;
        const bars = barsBySymbol.get(row.symbol);
        currentPrice = !marketClosed && quotePrice != null
          ? quotePrice
          : lastDailyClose(bars) ?? quotePrice;
      }

      const entry = row.entry_price;
      const returnPct = entry != null && entry > 0 && currentPrice != null
        ? (currentPrice / entry - 1) * 100
        : null;

      const benchEntry = row.benchmark_entry_price;
      const benchmarkReturnPct = benchEntry != null && benchEntry > 0 && spyPrice != null
        ? (spyPrice / benchEntry - 1) * 100
        : null;

      return { ...summary, currentPrice, returnPct, benchmarkReturnPct };
    })
    .sort((a, b) => b.pickDate.localeCompare(a.pickDate));  // newest first
}

function summarize(
  picks: PickWithPerformance[],
  series: SeriesPoint[],
  trackingSince: string | null
): PerformanceSummary {
  const tracked = picks.filter((p) => p.returnPct != null);
  const last = series[series.length - 1] ?? null;

  const winners = tracked.filter((p) => (p.returnPct ?? 0) > 0).length;

  let best: PerformanceSummary['bestPick'] = null;
  let worst: PerformanceSummary['worstPick'] = null;
  for (const p of tracked) {
    const r = p.returnPct!;
    if (!best || r > best.returnPct) best = { symbol: p.symbol, returnPct: r };
    if (!worst || r < worst.returnPct) worst = { symbol: p.symbol, returnPct: r };
  }

  return {
    pickCount: picks.length,
    trackedCount: tracked.length,
    trackingSince,
    totalReturnPct: last?.picksPct ?? null,
    benchmarkReturnPct: last?.benchmarkPct ?? null,
    outperformancePct: last ? last.picksPct - last.benchmarkPct : null,
    winners,
    hitRatePct: tracked.length > 0 ? (winners / tracked.length) * 100 : null,
    bestPick: best,
    worstPick: worst,
    insufficientSample: tracked.length < MIN_PICKS_FOR_HEADLINE,
  };
}

/**
 * Live performance for a single pick — used by the hero card and the detail
 * page, which need one row fresh rather than the whole cached track record.
 * Two quotes (the pick + SPY) in one batched request.
 */
export async function livePerformanceFor(row: {
  symbol: string;
  entry_price: number | null;
  benchmark_entry_price: number | null;
  status: string;
  close_price: number | null;
}): Promise<Pick<PickWithPerformance, 'currentPrice' | 'returnPct' | 'benchmarkReturnPct'>> {
  const empty = { currentPrice: null, returnPct: null, benchmarkReturnPct: null };

  if (row.status === 'closed' && row.close_price != null) {
    const entry = row.entry_price;
    return {
      currentPrice: row.close_price,
      returnPct: entry != null && entry > 0 ? (row.close_price / entry - 1) * 100 : null,
      benchmarkReturnPct: null,
    };
  }

  let quotes: Map<string, { c: number }>;
  try {
    quotes = await withRateLimitRetry(() => getStockQuotes([row.symbol, BENCHMARK_SYMBOL]));
  } catch {
    return empty;
  }

  const quote = quotes.get(row.symbol);
  const currentPrice = quote && Number.isFinite(quote.c) && quote.c > 0 ? quote.c : null;
  const spy = quotes.get(BENCHMARK_SYMBOL);

  return {
    currentPrice,
    returnPct:
      row.entry_price != null && row.entry_price > 0 && currentPrice != null
        ? (currentPrice / row.entry_price - 1) * 100
        : null,
    benchmarkReturnPct:
      row.benchmark_entry_price != null && row.benchmark_entry_price > 0 && spy?.c
        ? (spy.c / row.benchmark_entry_price - 1) * 100
        : null,
  };
}

function emptyResponse(): PerformanceResponse {
  return {
    series: [],
    normalized: [],
    picks: [],
    summary: {
      pickCount: 0,
      trackedCount: 0,
      trackingSince: null,
      totalReturnPct: null,
      benchmarkReturnPct: null,
      outperformancePct: null,
      winners: 0,
      hitRatePct: null,
      bestPick: null,
      worstPick: null,
      insufficientSample: true,
    },
  };
}
