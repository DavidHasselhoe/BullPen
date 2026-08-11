import type { EventType, UnifiedEvent, DayModel } from './types';

/** Default max rows a compact grid cell shows before collapsing the rest into
 *  "+N more" — the week grid's cells have room for this many; the month
 *  grid's cells are shorter and pass a smaller limit explicitly. */
const CELL_LIMIT = 3;

const EMPTY_EVENTS: UnifiedEvent[] = [];

function emptyTypeCounts(): Record<EventType, number> {
  return { earnings: 0, dividends: 0, splits: 0, ipo: 0 };
}

/**
 * Groups events by day, splits each day into "mine" (matches mySymbols) vs.
 * "others" (ranked by market cap, nulls last), and precomputes the compact
 * cell's `shown`/`moreCount` so DayCell has no business logic of its own.
 * Pure — safe to call from a script or a component. Works for any flat date
 * list, week or month; the grid shape is a rendering concern, not a data one.
 *
 * Deliberately O(n log n + n + days), not O(days × n). The previous version
 * re-filtered the whole event list once per date and sorted each day
 * separately. That was invisible while a week returned ~2 events, but the
 * per-day data fix pushed a month to a couple of thousand — roughly 62k
 * predicate calls plus 31 sorts, redone on every filter or holdings change.
 * Sorting once up front means each date bucket comes out already ranked.
 *
 * `dayTotals` carries the server's true per-day counts (rows beyond the API's
 * per-day cap never reach the client), so "+N more" reflects the real day
 * rather than the size of the truncated array.
 */
export function buildDayModel(
  events: UnifiedEvent[],
  dates: string[],
  mySymbols: Set<string>,
  typeFilter: Set<EventType>,
  cellLimit: number = CELL_LIMIT,
  dayTotals?: Record<string, Partial<Record<EventType, number>>>,
): DayModel[] {
  // One pass to filter, one sort for the whole list. Uppercasing happens once
  // per event rather than once per event per day.
  const filtered: Array<UnifiedEvent & { _sym: string }> = [];
  for (const e of events) {
    if (!typeFilter.has(e.type)) continue;
    filtered.push({ ...e, _sym: e.symbol.toUpperCase() });
  }

  filtered.sort((a, b) => {
    const ac = a.marketCap ?? -1;
    const bc = b.marketCap ?? -1;
    if (ac !== bc) return bc - ac;
    // Stable tiebreak: without it, equal/absent market caps fall back to
    // provider row order, which reshuffles between refetches.
    return a._sym.localeCompare(b._sym);
  });

  // Bucket in one pass. Input is pre-sorted, so every bucket is already in
  // rank order and no per-day sort is needed.
  const mineByDate = new Map<string, UnifiedEvent[]>();
  const othersByDate = new Map<string, UnifiedEvent[]>();
  const countsByDate = new Map<string, Record<EventType, number>>();

  for (const e of filtered) {
    const target = mySymbols.has(e._sym) ? mineByDate : othersByDate;
    const bucket = target.get(e.date);
    if (bucket) bucket.push(e);
    else target.set(e.date, [e]);

    let counts = countsByDate.get(e.date);
    if (!counts) {
      counts = emptyTypeCounts();
      countsByDate.set(e.date, counts);
    }
    counts[e.type]++;
  }

  return dates.map((date) => {
    const mine = mineByDate.get(date) ?? EMPTY_EVENTS;
    const others = othersByDate.get(date) ?? EMPTY_EVENTS;
    const returnedTotal = mine.length + others.length;

    // Prefer the server's true totals; fall back to what actually arrived.
    const serverTotals = dayTotals?.[date];
    const typeCounts = countsByDate.get(date) ?? emptyTypeCounts();
    let total = returnedTotal;
    if (serverTotals) {
      let sum = 0;
      let sawFiltered = false;
      for (const [type, n] of Object.entries(serverTotals) as [EventType, number][]) {
        if (!typeFilter.has(type)) continue;
        sawFiltered = true;
        sum += n;
        // Surface the true count per type too, so the footer strip is honest.
        typeCounts[type] = Math.max(typeCounts[type], n);
      }
      if (sawFiltered) total = Math.max(returnedTotal, sum);
    }

    const shown = mine.length >= cellLimit
      ? mine.slice(0, cellLimit)
      : [...mine, ...others.slice(0, cellLimit - mine.length)];

    return {
      date,
      mine,
      others,
      shown,
      moreCount: Math.max(0, total - shown.length),
      total,
      typeCounts,
    };
  });
}
