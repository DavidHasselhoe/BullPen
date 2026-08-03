import type { EventType, UnifiedEvent, DayModel } from './types';

/** Default max rows a compact grid cell shows before collapsing the rest into
 *  "+N more" — the week grid's cells have room for this many; the month
 *  grid's cells are shorter and pass a smaller limit explicitly. */
const CELL_LIMIT = 3;

/**
 * Groups events by day, splits each day into "mine" (matches mySymbols) vs.
 * "others" (ranked by market cap, nulls last), and precomputes the compact
 * cell's `shown`/`moreCount` so DayCell has no business logic of its own.
 * Pure — safe to call from a script or a component. Works for any flat date
 * list, week or month — the grid shape is a rendering concern, not a data one.
 */
export function buildDayModel(
  events: UnifiedEvent[],
  dates: string[],
  mySymbols: Set<string>,
  typeFilter: Set<EventType>,
  cellLimit: number = CELL_LIMIT,
): DayModel[] {
  const filtered = events.filter((e) => typeFilter.has(e.type));

  return dates.map((date) => {
    const dayEvents = filtered.filter((e) => e.date === date);
    const mine = dayEvents.filter((e) => mySymbols.has(e.symbol.toUpperCase()));
    const others = dayEvents
      .filter((e) => !mySymbols.has(e.symbol.toUpperCase()))
      .sort((a, b) => (b.marketCap ?? -1) - (a.marketCap ?? -1));
    const shown = [...mine, ...others].slice(0, cellLimit);

    return {
      date,
      mine,
      others,
      shown,
      moreCount: dayEvents.length - shown.length,
      total: dayEvents.length,
    };
  });
}
