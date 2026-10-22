/**
 * The watchlist list scorecard: how a list's picks have done since they were
 * added, against the S&P 500 (SPY) over the same dates, plus today's move.
 *
 * Pure arithmetic, shared by the page and scripts/test-watchlist-scorecard.ts.
 * Percent only, never money: nobody bought these.
 */

/** One day's close; the shape the shared dailycloses cache holds. */
export interface DayClose {
  /** YYYY-MM-DD. */
  date: string;
  close: number;
}

/** A timestamp's date in US market time, the calendar daily closes are keyed by. */
export const etDate = (ts: string) => new Date(ts).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

/** The last close on or before `date`, from a series ascending by date (a weekend or holiday falls back to the session before). */
export function closeOnOrBefore(series: DayClose[] | undefined, date: string): number | null {
  if (!series) return null;
  let lo = 0, hi = series.length - 1, found: number | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (series[mid].date <= date) { found = series[mid].close; lo = mid + 1; }
    else hi = mid - 1;
  }
  return found;
}

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

/** One pick on the calendar, for the history chart. */
export interface HistoryPick {
  symbol: string;
  /** ET date it was added. */
  start: string;
  /** ET date it was removed; its return freezes at that day's close. */
  end?: string;
}

export interface ScorePoint {
  /** YYYY-MM-DD. */
  date: string;
  pct: number;
  benchPct: number;
  /** Picks that joined the average on this day. */
  added: string[];
}

/**
 * The scorecard as it read at each day's close: listScore() evaluated on
 * every trading day of the benchmark since the first pick. Its last point is
 * the strip's number at the latest close, which is why this does not chain
 * daily returns the way the holdings calendar does: a chained (time-weighted)
 * line ends somewhere else as soon as picks join on different days.
 *
 * A pick joins at 0% on its add day, so the line can step when one is added;
 * the benchmark steps the same way on the same days, keeping the two fair.
 */
export function scoreHistory(
  picks: HistoryPick[],
  closesOf: (symbol: string) => DayClose[] | undefined,
  bench: DayClose[],
): ScorePoint[] {
  // A pick joins on the session its start close comes from: a Saturday add
  // joins at 0% on Friday's close, not on Monday with Monday's move in it.
  const anchored = picks.map((p) => {
    let anchor = p.start;
    for (const { date } of bench) {
      if (date > p.start) break;
      anchor = date;
    }
    return { ...p, anchor };
  });
  const first = anchored.reduce<string | null>((m, p) => (m === null || p.anchor < m ? p.anchor : m), null);
  if (first === null) return [];

  const points: ScorePoint[] = [];
  let prev = '';
  for (const { date } of bench) {
    if (date < first) { prev = date; continue; }
    let pct = 0, benchPct = 0, n = 0;
    const added: string[] = [];
    for (const p of anchored) {
      if (p.anchor > date) continue;
      // Held at its start close until its add date (a Saturday crypto add sits
      // at 0% on Friday), and at its exit close after removal.
      const at = p.end && p.end < date ? p.end : date < p.start ? p.start : date;
      const startClose = closeOnOrBefore(closesOf(p.symbol), p.start);
      const benchStart = closeOnOrBefore(bench, p.start);
      const close = closeOnOrBefore(closesOf(p.symbol), at);
      const benchClose = closeOnOrBefore(bench, at);
      if (!startClose || !benchStart || !close || !benchClose) continue;
      pct += (close / startClose - 1) * 100;
      benchPct += (benchClose / benchStart - 1) * 100;
      n++;
      if (p.anchor > prev) added.push(p.symbol);
    }
    if (n > 0) points.push({ date, pct: pct / n, benchPct: benchPct / n, added });
    prev = date;
  }
  return points;
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
