/**
 * The watchlist list scorecard: how a list's picks have done since they were
 * added, against the S&P 500 (SPY) over the same dates, plus today's move.
 *
 * Pure arithmetic, shared by the page and scripts/test-watchlist-scorecard.ts.
 * Percent only, never money: nobody bought these.
 */

/** Anchors from GET /api/watchlist/lists/[listId]/since-added. */
export interface SinceAddedEntry {
  symbol: string;
  addedAt: string;
  /** Close on the day it was added (the last session's when markets were shut). Null when added today or unpriced. */
  startClose: number | null;
  benchStart: number | null;
  /** Set for a pick taken out of the list: it counts up to the close of the day it left. */
  removedAt?: string;
  endClose?: number | null;
  benchEnd?: number | null;
}

export interface PickReturn {
  /** The pick's change since it was added, percent. */
  pct: number;
  /** SPY's change over the same dates, percent. */
  benchPct: number;
}

/** One pick since it was added. A current pick runs to the live price, a removed one to its exit close. */
export function pickReturn(e: SinceAddedEntry, price: number | null | undefined, benchPrice: number | null | undefined): PickReturn | null {
  const end = e.removedAt ? e.endClose : price;
  const benchEnd = e.removedAt ? e.benchEnd : benchPrice;
  if (!e.startClose || !e.benchStart || !end || !benchEnd) return null;
  return { pct: (end / e.startClose - 1) * 100, benchPct: (benchEnd / e.benchStart - 1) * 100 };
}

export interface ListScore extends PickReturn {
  /** Picks with a price on both ends, current and removed. */
  counted: number;
  /** How many of those were taken out of the list. */
  removed: number;
}

/**
 * The list's record: the plain average of every priced pick, removed ones
 * included, against the same average for SPY. That average is exactly the
 * return of putting the same amount into each pick on the day it was added
 * (and into SPY on those same days), which is what the UI says it is.
 */
export function listScore(
  entries: SinceAddedEntry[],
  priceOf: (symbol: string) => number | null | undefined,
  benchPrice: number | null | undefined,
): ListScore | null {
  let pct = 0, benchPct = 0, counted = 0, removed = 0;
  for (const e of entries) {
    const r = pickReturn(e, priceOf(e.symbol), benchPrice);
    if (!r) continue;
    pct += r.pct;
    benchPct += r.benchPct;
    counted++;
    if (e.removedAt) removed++;
  }
  return counted === 0 ? null : { pct: pct / counted, benchPct: benchPct / counted, counted, removed };
}

export interface TodaySummary {
  /** Equal-weight average of today's moves, percent. */
  avg: number;
  up: number;
  down: number;
  flat: number;
  best: { symbol: string; changePercent: number };
  worst: { symbol: string; changePercent: number };
}

/** Today's move across a list, each stock weighted equally. Flat means exactly 0, as on the cards. */
export function todaySummary(moves: { symbol: string; changePercent: number }[]): TodaySummary | null {
  if (moves.length === 0) return null;
  let sum = 0, up = 0, down = 0;
  let best = moves[0], worst = moves[0];
  for (const m of moves) {
    sum += m.changePercent;
    if (m.changePercent > 0) up++;
    else if (m.changePercent < 0) down++;
    if (m.changePercent > best.changePercent) best = m;
    if (m.changePercent < worst.changePercent) worst = m;
  }
  return { avg: sum / moves.length, up, down, flat: moves.length - up - down, best, worst };
}
