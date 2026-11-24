/**
 * A member's latest filing, grouped so a beginner can read it: what arrived,
 * one entry per stock with the net story, the user's stocks first, then the
 * biggest. Pure, so scripts/test-congress-ingest.ts can pin it.
 *
 * "Filing" here means the trades that arrived on one day (congress_trades
 * .created_at). That is a true statement about every row, including the
 * executive-branch ones that carry no disclosure date at all, where the day
 * BullPen received a report is the only "when it became public" we have.
 */

import { amountBounds, tradeDirection, type CongressTradeRow } from './types';

type Trade = CongressTradeRow & { symbol: string };

/**
 * 0 small (the $1K to $15K bracket), 1 medium (up to $100K), 2 large (up to
 * $1M), 3 very large ($1M and up). Read from the bracket's floor: brackets are
 * filed at .001 boundaries, so the floor alone places every one of them.
 */
export type SizeLevel = 0 | 1 | 2 | 3;

export function sizeLevel(t: Pick<CongressTradeRow, 'amountLow' | 'amountHigh' | 'amountRange'>): SizeLevel | null {
  const { low } = amountBounds(t.amountLow, t.amountHigh, t.amountRange);
  if (low == null) return null;
  if (low > 1_000_000) return 3;
  if (low > 100_000) return 2;
  if (low > 15_000) return 1;
  return 0;
}

function floor(t: Trade): number {
  return amountBounds(t.amountLow, t.amountHigh, t.amountRange).low ?? -1;
}

/** The UTC day a row arrived, or null for rows read before addedAt existed. */
export function arrivalDay(t: Pick<CongressTradeRow, 'addedAt'>): string | null {
  if (!t.addedAt) return null;
  const ms = Date.parse(t.addedAt);
  return Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 10) : null;
}

export type Relation = 'owned' | 'watched' | null;

export interface FilingStock {
  symbol: string;
  companyName: string | null;
  relation: Relation;
  buys: number;
  sells: number;
  /** Trade dates, oldest and newest (YYYY-MM-DD); null when every date is unknown. */
  firstDate: string | null;
  lastDate: string | null;
  /** The largest trade by bracket floor; its range is the one the row shows. */
  biggest: Trade;
  /** Oldest first, so an expanded row reads as the story in order. */
  trades: Trade[];
}

export interface Filing {
  /** YYYY-MM-DD (UTC) the trades arrived. */
  day: string;
  count: number;
  buys: number;
  sells: number;
  /** Trades in the smallest bracket ($1K to $15K). */
  small: number;
  firstDate: string | null;
  lastDate: string | null;
  /** Your stocks first (owned, then watched), then biggest, then newest. */
  stocks: FilingStock[];
  /** The few largest trades, for the summary sentence. Large or bigger only. */
  biggest: Trade[];
}

/**
 * The newest arrival day that is not the member's first. The first is the
 * backfill: up to 100 trades spanning years, landed in one go when the member
 * was added, which is history rather than a filing anyone made. Returns null
 * when there is nothing but the backfill.
 */
export function latestFilingDay(trades: Pick<CongressTradeRow, 'addedAt'>[]): string | null {
  const days = [...new Set(trades.map(arrivalDay).filter((d): d is string => !!d))].sort();
  return days.length > 1 ? days[days.length - 1] : null;
}

/** Arrival days before `latest`, newest first, without the backfill day. */
export function earlierFilingDays(trades: Pick<CongressTradeRow, 'addedAt'>[], latest: string): string[] {
  const days = [...new Set(trades.map(arrivalDay).filter((d): d is string => !!d))].sort();
  return days.slice(1).filter((d) => d < latest).reverse();
}

const MAX_BIGGEST = 3;

export function buildFiling(
  trades: Trade[],
  day: string,
  owned: ReadonlySet<string>,
  watched: ReadonlySet<string>,
): Filing | null {
  const rows = trades.filter((t) => arrivalDay(t) === day);
  if (rows.length === 0) return null;

  const bySymbol = new Map<string, Trade[]>();
  for (const t of rows) bySymbol.set(t.symbol, [...(bySymbol.get(t.symbol) ?? []), t]);

  const rank = (r: Relation) => (r === 'owned' ? 0 : r === 'watched' ? 1 : 2);
  const stocks: FilingStock[] = [...bySymbol].map(([symbol, ts]) => {
    const sorted = [...ts].sort((a, b) => (a.transactionDate ?? '').localeCompare(b.transactionDate ?? ''));
    const dates = sorted.map((t) => t.transactionDate).filter((d): d is string => !!d);
    const biggest = ts.reduce((a, b) => (floor(b) > floor(a) ? b : a));
    return {
      symbol,
      companyName: ts[0].companyName ?? null,
      relation: owned.has(symbol) ? 'owned' : watched.has(symbol) ? 'watched' : null,
      buys: ts.filter((t) => tradeDirection(t.tradeType) === 'buy').length,
      sells: ts.filter((t) => tradeDirection(t.tradeType) === 'sell').length,
      firstDate: dates[0] ?? null,
      lastDate: dates[dates.length - 1] ?? null,
      biggest,
      trades: sorted,
    };
  });
  stocks.sort(
    (a, b) =>
      rank(a.relation) - rank(b.relation) ||
      floor(b.biggest) - floor(a.biggest) ||
      (b.lastDate ?? '').localeCompare(a.lastDate ?? '') ||
      a.symbol.localeCompare(b.symbol),
  );

  const dates = rows.map((t) => t.transactionDate).filter((d): d is string => !!d).sort();
  // One per stock: TJX bought twice at $250K to $500K is one fact, not two.
  const biggest = stocks
    .map((s) => s.biggest)
    .filter((t) => (sizeLevel(t) ?? 0) >= 2)
    .sort((a, b) => floor(b) - floor(a) || a.symbol.localeCompare(b.symbol))
    .slice(0, MAX_BIGGEST);

  return {
    day,
    count: rows.length,
    buys: rows.filter((t) => tradeDirection(t.tradeType) === 'buy').length,
    sells: rows.filter((t) => tradeDirection(t.tradeType) === 'sell').length,
    small: rows.filter((t) => sizeLevel(t) === 0).length,
    firstDate: dates[0] ?? null,
    lastDate: dates[dates.length - 1] ?? null,
    stocks,
    biggest,
  };
}

/**
 * The biggest trades folded into runs that share a direction and a bracket,
 * so the sentence can say "sold Comcast, McDonald's and Home Depot, $1M to $5M
 * each" instead of repeating the verb and the range three times.
 */
export function biggestRuns(biggest: Trade[]): { direction: ReturnType<typeof tradeDirection>; trades: Trade[] }[] {
  const runs: { direction: ReturnType<typeof tradeDirection>; trades: Trade[] }[] = [];
  for (const t of biggest) {
    const dir = tradeDirection(t.tradeType);
    const last = runs[runs.length - 1];
    if (last && last.direction === dir && last.trades[0].amountRange === t.amountRange) {
      last.trades.push(t);
    } else runs.push({ direction: dir, trades: [t] });
  }
  return runs;
}
