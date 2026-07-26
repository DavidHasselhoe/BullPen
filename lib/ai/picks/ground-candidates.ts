/**
 * Stage 2 of the weekly-pick pipeline: take the tickers Claude surfaced from web
 * search and check every one of them against BullPen's own numbers before the
 * model is allowed to commit to any of them.
 *
 * Two jobs:
 *   1. HALLUCINATION GUARD — a ticker the scout invented, or one that's a
 *      foreign cross-listing / delisted shell, is dropped here. Nothing reaches
 *      the final call that we can't price and describe from our own tables.
 *   2. GROUNDING — attach the quantitative picture (valuation vs peers, health
 *      score, momentum) so the thesis argues from real numbers rather than from
 *      whatever narrative the web happened to be running that week.
 *
 * Cost: `screener_stats`, `screener_universe`, and the metric-stat rollups are
 * all plain Postgres reads populated by the daily prefetch cron — zero
 * TwelveData credits. Only an off-universe candidate triggers a live fetch, and
 * that's capped (see MAX_LIVE_FALLBACKS).
 */

import { createServerClient } from '@/lib/supabase/client';
import { getBenchmarks, type BenchmarksResult, type SectorMetricKey } from '@/lib/finance/sector-benchmarks';
import { getHealthScoreForSymbol } from '@/lib/finance/get-health-score';
import { getStockQuotes, withRateLimitRetry } from '@/lib/twelvedata/twelvedata-client';
import type { Candidate } from './schema';

/** Cap on candidates we'll spend live TwelveData credits to rescue. */
const MAX_LIVE_FALLBACKS = 2;

/** Minimum market cap, in USD. Keeps beginners out of microcap territory. */
export const MIN_MARKET_CAP = 2_000_000_000;

interface ScreenerRow {
  ticker: string;
  name: string | null;
  sector: string | null;
  industry: string | null;
  logo_url: string | null;
  market_cap: number | null;
  pe_ratio: number | null;
  forward_pe: number | null;
  pb_ratio: number | null;
  ps_ratio: number | null;
  ev_to_ebitda: number | null;
  profit_margin: number | null;
  revenue_growth_yoy: number | null;
  earnings_growth_yoy: number | null;
  beta: number | null;
  dividend_yield: number | null;
  week52_high: number | null;
  week52_low: number | null;
  day50_ma: number | null;
  day200_ma: number | null;
  health_score: number | null;
  health_score_grade: string | null;
}

const SCREENER_COLUMNS =
  'ticker, name, sector, industry, logo_url, market_cap, pe_ratio, forward_pe, pb_ratio, ps_ratio, ' +
  'ev_to_ebitda, profit_margin, revenue_growth_yoy, earnings_growth_yoy, beta, dividend_yield, ' +
  'week52_high, week52_low, day50_ma, day200_ma, health_score, health_score_grade';

/** Where a value sits relative to its peer group. */
export type PeerPosition = 'well below' | 'below' | 'in line with' | 'above' | 'well above';

export interface PeerComparison {
  metric: SectorMetricKey;
  value: number;
  median: number;
  position: PeerPosition;
}

export interface GroundedCandidate {
  symbol: string;
  /** The scout's one-line narrative reason, carried through to the final call. */
  scoutReason: string;
  name: string | null;
  sector: string | null;
  industry: string | null;
  logoUrl: string | null;
  marketCap: number | null;
  price: number | null;
  stats: ScreenerRow;
  healthScore: number | null;
  healthGrade: string | null;
  /** Which peer group the medians came from, and how big it was. */
  peerGroup: { type: BenchmarksResult['groupType']; label: string } | null;
  peers: PeerComparison[];
  /** % above the 50-day and 200-day moving averages. Null when unavailable. */
  vs50dma: number | null;
  vs200dma: number | null;
  /** % below the 52-week high (positive = below the high). */
  below52wHigh: number | null;
  /** True when this candidate needed a live fetch because it wasn't in screener_stats. */
  rescued: boolean;
}

export interface GroundingResult {
  survivors: GroundedCandidate[];
  /** symbol → why it was dropped. Logged by the cron for observability. */
  rejected: Record<string, string>;
}

// ─── Peer positioning ────────────────────────────────────────────────────────

/**
 * Classify a value against its peer distribution. Uses the quartile boundaries
 * rather than a fixed % band so a tight distribution (utilities' beta) and a
 * wide one (biotech P/E) are both judged on their own terms.
 */
function classify(value: number, p25: number, median: number, p75: number): PeerPosition {
  if (value < p25) return 'well below';
  if (value > p75) return 'well above';
  // Within the interquartile range: call it "in line" near the median, and
  // below/above once it's meaningfully off it but still inside the box.
  const lowerMid = (p25 + median) / 2;
  const upperMid = (median + p75) / 2;
  if (value < lowerMid) return 'below';
  if (value > upperMid) return 'above';
  return 'in line with';
}

/** Metrics worth comparing to peers in a pick thesis, in presentation order. */
const COMPARED_METRICS: Array<{ key: SectorMetricKey; from: keyof ScreenerRow }> = [
  { key: 'pe_ratio', from: 'pe_ratio' },
  { key: 'forward_pe', from: 'forward_pe' },
  { key: 'ps_ratio', from: 'ps_ratio' },
  { key: 'pb_ratio', from: 'pb_ratio' },
  { key: 'ev_to_ebitda', from: 'ev_to_ebitda' },
  { key: 'profit_margin', from: 'profit_margin' },
  { key: 'revenue_growth_yoy', from: 'revenue_growth_yoy' },
  { key: 'earnings_growth_yoy', from: 'earnings_growth_yoy' },
  { key: 'beta', from: 'beta' },
  { key: 'dividend_yield', from: 'dividend_yield' },
];

function buildPeerComparisons(row: ScreenerRow, result: BenchmarksResult | null): PeerComparison[] {
  if (!result) return [];
  const out: PeerComparison[] = [];
  for (const { key, from } of COMPARED_METRICS) {
    const bench = result.benchmarks[key];
    const raw = row[from];
    if (!bench || typeof raw !== 'number' || !Number.isFinite(raw)) continue;
    out.push({
      metric: key,
      value: raw,
      median: bench.median,
      position: classify(raw, bench.p25, bench.median, bench.p75),
    });
  }
  return out;
}

function pctDiff(price: number | null, reference: number | null | undefined): number | null {
  if (price == null || reference == null || reference === 0) return null;
  return ((price - reference) / reference) * 100;
}

// ─── Main entry point ────────────────────────────────────────────────────────

/**
 * Ground every scouted candidate, dropping the ones we can't stand behind.
 *
 * A candidate survives only if we can establish, from our own data: a real
 * company name, a sector, a current price, and a market cap at or above
 * MIN_MARKET_CAP. Everything else is context that improves the pick but isn't
 * required — a genuinely under-covered name shouldn't be rejected just because
 * its industry bucket is thin.
 */
export async function groundCandidates(candidates: Candidate[]): Promise<GroundingResult> {
  const rejected: Record<string, string> = {};
  if (candidates.length === 0) return { survivors: [], rejected };

  const supabase = createServerClient();
  const symbols = candidates.map((c) => c.symbol);

  // ── One round-trip for all the cached fundamentals ──────────────────────────
  const [statsRes, universeRes, quotes] = await Promise.all([
    supabase.from('screener_stats').select(SCREENER_COLUMNS).in('ticker', symbols),
    // Explicit row type: the generated Supabase `Database` type in this repo
    // doesn't carry every table, so untyped selects infer as `never`.
    supabase
      .from('screener_universe')
      .select('ticker, name, exchange, type, country')
      .in('ticker', symbols)
      .returns<Array<{ ticker: string; name: string | null; exchange: string | null; type: string | null; country: string | null }>>(),
    // TwelveData directly rather than the lib/market-data facade: that facade can
    // fall back to Finnhub, and we hold no commercial licence to display Finnhub
    // data — a pick's price is very much display data.
    withRateLimitRetry(() => getStockQuotes(symbols)).catch(() => new Map()),
  ]);

  const statsByTicker = new Map<string, ScreenerRow>();
  for (const row of (statsRes.data ?? []) as ScreenerRow[]) {
    statsByTicker.set(row.ticker.toUpperCase(), row);
  }

  const universeByTicker = new Map<string, { name: string | null; exchange: string | null; type: string | null; country: string | null }>();
  for (const row of universeRes.data ?? []) {
    universeByTicker.set(String(row.ticker).toUpperCase(), {
      name: row.name ?? null,
      exchange: row.exchange ?? null,
      type: row.type ?? null,
      country: row.country ?? null,
    });
  }

  const survivors: GroundedCandidate[] = [];
  let liveFallbacksUsed = 0;

  for (const candidate of candidates) {
    const symbol = candidate.symbol;
    const quote = quotes.get(symbol);
    const price = quote?.c ?? null;

    let row = statsByTicker.get(symbol);
    let rescued = false;

    if (!row) {
      // Not in the prefetched stats. Only worth a live fetch if the symbol is at
      // least a known US-listed name in the wider universe — otherwise it's most
      // likely a hallucination or a foreign cross-listing, and we drop it for free.
      const inUniverse = universeByTicker.get(symbol);
      if (!inUniverse) {
        rejected[symbol] = 'not found in screener_stats or screener_universe (likely hallucinated or not US-listed)';
        continue;
      }
      if (liveFallbacksUsed >= MAX_LIVE_FALLBACKS) {
        rejected[symbol] = 'in universe but not prefetched, and the live-fetch budget for this run is spent';
        continue;
      }
      liveFallbacksUsed++;
      rescued = true;

      // Computing the health score also populates screener_stats.health_score as
      // a side effect, so a rescued candidate is cheaper next week.
      try {
        await getHealthScoreForSymbol(symbol);
      } catch (err) {
        rejected[symbol] = `live health-score fetch failed: ${err instanceof Error ? err.message : 'unknown'}`;
        continue;
      }

      const { data: refetched } = await supabase
        .from('screener_stats')
        .select(SCREENER_COLUMNS)
        .eq('ticker', symbol)
        .maybeSingle();

      if (!refetched) {
        rejected[symbol] = 'no stats row even after a live fetch';
        continue;
      }
      row = refetched as ScreenerRow;
    }

    if (price == null) {
      rejected[symbol] = 'no live quote available — cannot establish an entry price';
      continue;
    }
    if (row.market_cap != null && row.market_cap < MIN_MARKET_CAP) {
      rejected[symbol] = `market cap $${(row.market_cap / 1e9).toFixed(2)}B is below the $${MIN_MARKET_CAP / 1e9}B floor`;
      continue;
    }
    if (!row.name && !universeByTicker.get(symbol)?.name) {
      rejected[symbol] = 'no company name on record';
      continue;
    }

    const benchmarks = await getBenchmarks(row.sector, row.industry);

    survivors.push({
      symbol,
      scoutReason: candidate.reason,
      name: row.name ?? universeByTicker.get(symbol)?.name ?? null,
      sector: row.sector,
      industry: row.industry,
      logoUrl: row.logo_url,
      marketCap: row.market_cap,
      price,
      stats: row,
      healthScore: row.health_score,
      healthGrade: row.health_score_grade,
      peerGroup: benchmarks ? { type: benchmarks.groupType, label: benchmarks.groupLabel } : null,
      peers: buildPeerComparisons(row, benchmarks),
      vs50dma: pctDiff(price, row.day50_ma),
      vs200dma: pctDiff(price, row.day200_ma),
      below52wHigh: row.week52_high ? ((row.week52_high - price) / row.week52_high) * 100 : null,
      rescued,
    });
  }

  return { survivors, rejected };
}

// ─── Prompt formatting ───────────────────────────────────────────────────────

function fmt(n: number | null | undefined, digits = 2, suffix = ''): string {
  if (n == null || !Number.isFinite(n)) return 'n/a';
  return `${n.toFixed(digits)}${suffix}`;
}

function fmtCap(n: number | null): string {
  if (n == null) return 'n/a';
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  return `$${(n / 1e6).toFixed(0)}M`;
}

/** Metrics stored as fractions in screener_stats but read as percentages. */
const FRACTION_METRICS = new Set<SectorMetricKey>(['profit_margin', 'dividend_yield']);
const PERCENT_METRICS = new Set<SectorMetricKey>(['revenue_growth_yoy', 'earnings_growth_yoy']);

const METRIC_LABELS: Record<SectorMetricKey, string> = {
  pe_ratio: 'P/E',
  forward_pe: 'Forward P/E',
  pb_ratio: 'P/B',
  ps_ratio: 'P/S',
  ev_to_ebitda: 'EV/EBITDA',
  profit_margin: 'Profit margin',
  revenue_growth_yoy: 'Revenue growth YoY',
  earnings_growth_yoy: 'Earnings growth YoY',
  beta: 'Beta',
  dividend_yield: 'Dividend yield',
};

function formatPeerLine(p: PeerComparison): string {
  const label = METRIC_LABELS[p.metric];
  if (FRACTION_METRICS.has(p.metric)) {
    return `${label}: ${fmt(p.value * 100, 1, '%')} (${p.position} peer median ${fmt(p.median * 100, 1, '%')})`;
  }
  if (PERCENT_METRICS.has(p.metric)) {
    return `${label}: ${fmt(p.value, 1, '%')} (${p.position} peer median ${fmt(p.median, 1, '%')})`;
  }
  return `${label}: ${fmt(p.value)} (${p.position} peer median ${fmt(p.median)})`;
}

/** Render the grounded scorecards as the data block for the commit prompt. */
export function formatScorecards(candidates: GroundedCandidate[]): string {
  return candidates
    .map((c, i) => {
      const peerLines = c.peers.length > 0
        ? c.peers.map((p) => `  - ${formatPeerLine(p)}`).join('\n')
        : '  - (no peer benchmarks available for this group)';

      const momentum = [
        c.vs50dma != null ? `${c.vs50dma >= 0 ? '+' : ''}${c.vs50dma.toFixed(1)}% vs 50-day MA` : null,
        c.vs200dma != null ? `${c.vs200dma >= 0 ? '+' : ''}${c.vs200dma.toFixed(1)}% vs 200-day MA` : null,
        c.below52wHigh != null ? `${c.below52wHigh.toFixed(1)}% below its 52-week high` : null,
      ].filter(Boolean).join(', ') || 'n/a';

      return [
        `### ${i + 1}. ${c.symbol} — ${c.name ?? 'Unknown'}`,
        `Sector: ${c.sector ?? 'n/a'} · Industry: ${c.industry ?? 'n/a'} · Market cap: ${fmtCap(c.marketCap)}`,
        `Price: $${fmt(c.price)}`,
        `BullPen Health Score: ${c.healthScore ?? 'n/a'}${c.healthGrade ? ` (grade ${c.healthGrade})` : ''}`,
        `Peer group: ${c.peerGroup ? `${c.peerGroup.label} (${c.peerGroup.type})` : 'none available'}`,
        `Valuation & quality vs peers:`,
        peerLines,
        `Momentum: ${momentum}`,
        `Why the scout flagged it: ${c.scoutReason}`,
      ].join('\n');
    })
    .join('\n\n');
}

/**
 * The subset of grounding data stored on the pick row, so the detail page can
 * later show "here is what the numbers looked like the day we called it"
 * without re-deriving anything.
 */
export function toMetricsSnapshot(c: GroundedCandidate) {
  return {
    price: c.price,
    marketCap: c.marketCap,
    healthScore: c.healthScore,
    healthGrade: c.healthGrade,
    peerGroup: c.peerGroup,
    peers: c.peers,
    vs50dma: c.vs50dma,
    vs200dma: c.vs200dma,
    below52wHigh: c.below52wHigh,
    stats: {
      pe_ratio: c.stats.pe_ratio,
      forward_pe: c.stats.forward_pe,
      pb_ratio: c.stats.pb_ratio,
      ps_ratio: c.stats.ps_ratio,
      ev_to_ebitda: c.stats.ev_to_ebitda,
      profit_margin: c.stats.profit_margin,
      revenue_growth_yoy: c.stats.revenue_growth_yoy,
      earnings_growth_yoy: c.stats.earnings_growth_yoy,
      beta: c.stats.beta,
      dividend_yield: c.stats.dividend_yield,
      week52_high: c.stats.week52_high,
      week52_low: c.stats.week52_low,
    },
  };
}
