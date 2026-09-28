/**
 * Stage 1 of the weekly-pick pipeline: a deterministic multi-factor screen.
 *
 * WHY THIS COMES FIRST
 * When an LLM proposes the ideas, it proposes what the internet is talking
 * about: large, heavily covered, mostly tech names (CFA Institute 2026,
 * "Attention bias in AI-driven investing"). Our first ten picks were nine AI
 * infrastructure names in a row for exactly that reason. The published
 * evidence for LLMs adding value out of sample puts the model on top of a
 * systematic signal (Anic et al. 2025), not in place of one. So the universe
 * now comes from factors with decades of out-of-sample evidence, and Claude's
 * job is due diligence on that shortlist.
 *
 * THE FACTORS, each ranked within its own sector so a bank is never compared
 * to a software company:
 *   value    — earnings yield, EBITDA/EV, sales/price
 *   quality  — Health Score profitability + financial strength, profit margin
 *              (Asness et al., Quality Minus Junk; Novy-Marx)
 *   momentum — nearness to the 52-week high (George & Hwang 2004), and the
 *              50-day vs 200-day trend
 *   risk     — low beta, at half weight
 * Value and momentum are negatively correlated, which is the point of
 * combining them: each one's bad years tend to be the other's good ones.
 *
 * `screener_stats` has no price column, so the 50-day average stands in for
 * price in the momentum ratios. That smooths the signal; it doesn't change what
 * it measures. The finalists get a live quote in grounding.
 *
 * Cost: two paginated Postgres reads. Zero TwelveData credits, zero LLM calls.
 */

import { createServerClient } from '@/lib/supabase/client';
import { MIN_MARKET_CAP } from '@/lib/ai/picks/ground-candidates';

/** How many names go on to due diligence. */
export const SCREEN_SIZE = 25;
/** No sector may fill more than this many shortlist slots. */
export const MAX_PER_SECTOR = 4;
/** Rows older than this are left out rather than ranked on stale numbers. */
const MAX_STALENESS_DAYS = 10;
const PAGE = 1000;

// ponytail: fixed equal weights with risk at half. Revisit only once there's
// a year of live picks and the stored screen baskets to measure against.
const GROUP_WEIGHTS = { value: 1, quality: 1, momentum: 1, risk: 0.5 } as const;
type Group = keyof typeof GROUP_WEIGHTS;

interface Row {
  ticker: string;
  name: string | null;
  sector: string | null;
  market_cap: number | null;
  pe_ratio: number | null;
  forward_pe: number | null;
  ps_ratio: number | null;
  ev_to_ebitda: number | null;
  profit_margin: number | null;
  beta: number | null;
  week52_high: number | null;
  day50_ma: number | null;
  day200_ma: number | null;
  health_profitability: number | null;
  health_financial_strength: number | null;
  updated_at: string | null;
}

const COLUMNS =
  'ticker, name, sector, market_cap, pe_ratio, forward_pe, ps_ratio, ev_to_ebitda, profit_margin, beta, ' +
  'week52_high, day50_ma, day200_ma, health_profitability, health_financial_strength, updated_at';

export interface ScreenedStock {
  ticker: string;
  name: string | null;
  sector: string;
  marketCap: number;
  /** 0–100, weighted mean of the group scores. */
  composite: number;
  /** 0–100 percentile within the sector, per factor group. */
  scores: Record<Group, number | null>;
}

export interface ScreenResult {
  shortlist: ScreenedStock[];
  universeSize: number;
  excluded: { recent: number; blockedSector: number; noSector: number; stale: number; inconsistent: number; incomplete: number };
}

/**
 * True when a row's own ratios contradict each other. P/S must equal
 * P/E × profit margin; when it doesn't, the gap is almost always an exchange
 * rate: foreign filers' sales and EBITDA are stored in their home currency
 * against a USD market cap (HMY 16x = ZAR, ABEV 5.3x = BRL, CVE 1.4x = CAD,
 * measured 2026-09-28). Those rows look many times cheaper than they are, so
 * they'd win the value factor on a units error. Loss-makers can't be checked
 * this way and pass; they already rank at the bottom on earnings yield.
 */
export function ratiosDisagree(r: Pick<Row, 'pe_ratio' | 'ps_ratio' | 'profit_margin'>): boolean {
  if (r.pe_ratio == null || r.ps_ratio == null || r.profit_margin == null) return false;
  if (r.pe_ratio <= 0 || r.ps_ratio <= 0 || r.profit_margin <= 0.01) return false;
  const k = r.ps_ratio / (r.pe_ratio * r.profit_margin);
  return k < 0.8 || k > 1.25;
}

/** Higher is better for every raw metric this returns. Null = not measurable. */
function metrics(r: Row): Record<Group, Array<number | null>> {
  const inv = (x: number | null) => (x == null ? null : x > 0 ? 1 / x : -1);
  const earningsYield = r.forward_pe != null && r.forward_pe > 0
    ? 1 / r.forward_pe
    : inv(r.pe_ratio); // a loss (P/E <= 0) ranks at the bottom, not as missing
  const ratio = (a: number | null, b: number | null) => (a != null && b != null && b > 0 ? a / b : null);
  return {
    value: [earningsYield, inv(r.ev_to_ebitda), r.ps_ratio != null && r.ps_ratio > 0 ? 1 / r.ps_ratio : null],
    quality: [r.health_profitability, r.health_financial_strength, r.profit_margin],
    momentum: [ratio(r.day50_ma, r.week52_high), ratio(r.day50_ma, r.day200_ma)],
    risk: [r.beta == null ? null : -r.beta],
  };
}

/** Percentile (0–1) of each value within its list, ties sharing the mean rank. */
function percentiles(values: Array<number | null>): Array<number | null> {
  const present = values
    .map((v, i) => ({ v, i }))
    .filter((x): x is { v: number; i: number } => x.v != null && Number.isFinite(x.v))
    .sort((a, b) => a.v - b.v);
  const out: Array<number | null> = values.map(() => null);
  if (present.length < 2) return out;
  let k = 0;
  while (k < present.length) {
    let j = k;
    while (j + 1 < present.length && present[j + 1].v === present[k].v) j++;
    const pct = ((k + j) / 2) / (present.length - 1);
    for (let m = k; m <= j; m++) out[present[m].i] = pct;
    k = j + 1;
  }
  return out;
}

const mean = (xs: Array<number | null>) => {
  const v = xs.filter((x): x is number => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

/**
 * Rank a universe. Pure, so the dry-run script can assert on it directly.
 * Rows must already carry a sector.
 */
export function rankUniverse(rows: Array<Row & { sector: string }>): ScreenedStock[] {
  const bySector = new Map<string, Array<Row & { sector: string }>>();
  for (const r of rows) {
    const list = bySector.get(r.sector) ?? [];
    list.push(r);
    bySector.set(r.sector, list);
  }

  const ranked: ScreenedStock[] = [];
  for (const [sector, list] of bySector) {
    const raw = list.map(metrics);
    const groupScores = list.map(() => ({} as Record<Group, number | null>));

    for (const group of Object.keys(GROUP_WEIGHTS) as Group[]) {
      const width = raw[0][group].length;
      const perMetric = Array.from({ length: width }, (_, m) => percentiles(raw.map((x) => x[group][m])));
      list.forEach((_, i) => {
        groupScores[i][group] = mean(perMetric.map((col) => col[i]));
      });
    }

    list.forEach((r, i) => {
      const s = groupScores[i];
      // Value, quality and momentum are the evidence base. Missing any one of
      // them means we can't say why this name is on the list, so it isn't.
      if (s.value == null || s.quality == null || s.momentum == null) return;
      let num = 0;
      let den = 0;
      for (const g of Object.keys(GROUP_WEIGHTS) as Group[]) {
        if (s[g] == null) continue;
        num += s[g]! * GROUP_WEIGHTS[g];
        den += GROUP_WEIGHTS[g];
      }
      const pct = (x: number | null) => (x == null ? null : Math.round(x * 100));
      ranked.push({
        ticker: r.ticker,
        name: r.name,
        sector,
        marketCap: r.market_cap ?? 0,
        composite: Math.round((num / den) * 1000) / 10,
        scores: { value: pct(s.value), quality: pct(s.quality), momentum: pct(s.momentum), risk: pct(s.risk) },
      });
    });
  }

  // Ticker as tie-break keeps the order deterministic run to run.
  return ranked.sort((a, b) => b.composite - a.composite || a.ticker.localeCompare(b.ticker));
}

/** Top `size` names with at most `perSector` from any one sector. */
export function pickShortlist(ranked: ScreenedStock[], size = SCREEN_SIZE, perSector = MAX_PER_SECTOR): ScreenedStock[] {
  const counts = new Map<string, number>();
  const out: ScreenedStock[] = [];
  for (const s of ranked) {
    const n = counts.get(s.sector) ?? 0;
    if (n >= perSector) continue;
    counts.set(s.sector, n + 1);
    out.push(s);
    if (out.length === size) break;
  }
  return out;
}

async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}

export async function runFactorScreen(opts: {
  /** Tickers picked recently. Never re-screened. */
  exclude: Set<string>;
  /** Sectors that already hit this quarter's cap. */
  blockedSectors: Set<string>;
}): Promise<ScreenResult> {
  const supabase = createServerClient();

  // PostgREST caps an unpaginated select at 1000 rows; the >= $2B universe is
  // ~1,230, so both reads page with a stable order.
  const [rows, sectorRows] = await Promise.all([
    fetchAll<Row>((from, to) =>
      supabase.from('screener_stats').select(COLUMNS)
        .gte('market_cap', MIN_MARKET_CAP).eq('currency', 'USD')
        .order('ticker').range(from, to)
        .returns<Row[]>()),
    // screener_stats.sector is empty for most rows; ticker_sectors is the
    // shared sector cache the holdings page uses, same 11 labels.
    fetchAll<{ ticker: string; sector: string | null }>((from, to) =>
      supabase.from('ticker_sectors').select('ticker, sector')
        .order('ticker').range(from, to)
        .returns<Array<{ ticker: string; sector: string | null }>>()),
  ]);

  const sectorOf = new Map(sectorRows.map((r) => [r.ticker.toUpperCase(), r.sector]));
  const cutoff = Date.now() - MAX_STALENESS_DAYS * 86_400_000;
  const excluded = { recent: 0, blockedSector: 0, noSector: 0, stale: 0, inconsistent: 0, incomplete: 0 };

  const universe: Array<Row & { sector: string }> = [];
  for (const r of rows) {
    const ticker = r.ticker.toUpperCase();
    const sector = r.sector ?? sectorOf.get(ticker) ?? null;
    if (opts.exclude.has(ticker)) { excluded.recent++; continue; }
    if (!sector) { excluded.noSector++; continue; }
    if (opts.blockedSectors.has(sector)) { excluded.blockedSector++; continue; }
    if (!r.updated_at || Date.parse(r.updated_at) < cutoff) { excluded.stale++; continue; }
    if (ratiosDisagree(r)) { excluded.inconsistent++; continue; }
    universe.push({ ...r, ticker, sector });
  }

  const ranked = rankUniverse(universe);
  excluded.incomplete = universe.length - ranked.length;

  return { shortlist: pickShortlist(ranked), universeSize: ranked.length, excluded };
}

/** One line per name for the prompts: why the screen put it here. */
export function describeScreen(s: ScreenedStock): string {
  const f = (x: number | null) => (x == null ? 'n/a' : String(x));
  return `Factor screen: composite ${s.composite}/100 within ${s.sector} ` +
    `(value ${f(s.scores.value)}, quality ${f(s.scores.quality)}, momentum ${f(s.scores.momentum)}, low-risk ${f(s.scores.risk)}; percentiles vs sector peers)`;
}
