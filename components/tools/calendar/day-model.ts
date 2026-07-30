import type { EventType, UnifiedEvent, DayModel } from './types';

/** Max rows a compact grid cell shows before collapsing the rest into "+N more". */
const CELL_LIMIT = 3;

/**
 * Groups events by day, splits each day into "mine" (matches mySymbols) vs.
 * "others" (ranked by market cap, nulls last), and precomputes the compact
 * cell's `shown`/`moreCount` so DayCell has no business logic of its own.
 * Pure — safe to call from a script or a component.
 */
export function buildDayModel(
  events: UnifiedEvent[],
  weekDates: string[],
  mySymbols: Set<string>,
  typeFilter: Set<EventType>,
): DayModel[] {
  const filtered = events.filter((e) => typeFilter.has(e.type));

  return weekDates.map((date) => {
    const dayEvents = filtered.filter((e) => e.date === date);
    const mine = dayEvents.filter((e) => mySymbols.has(e.symbol.toUpperCase()));
    const others = dayEvents
      .filter((e) => !mySymbols.has(e.symbol.toUpperCase()))
      .sort((a, b) => (b.marketCap ?? -1) - (a.marketCap ?? -1));
    const shown = [...mine, ...others].slice(0, CELL_LIMIT);

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
