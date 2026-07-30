// Verifies buildDayModel: mine-first ordering, market-cap ranking of the rest,
// the 3-item cell cap + moreCount math, empty days, and type filtering.
import { buildDayModel } from '../components/tools/calendar/day-model';
import type { UnifiedEvent, EventType } from '../components/tools/calendar/types';

function ev(overrides: Pick<UnifiedEvent, 'symbol' | 'date' | 'type'> & Partial<UnifiedEvent>): UnifiedEvent {
  return { name: undefined, marketCap: null, raw: {} as never, ...overrides };
}

const weekDates = ['2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06', '2026-08-07', '2026-08-08', '2026-08-09'];
const allTypes = new Set<EventType>(['earnings', 'dividends', 'splits', 'ipo']);

const events: UnifiedEvent[] = [
  ev({ symbol: 'AAPL', date: '2026-08-04', type: 'earnings', marketCap: 3_000_000_000_000 }),
  ev({ symbol: 'MSFT', date: '2026-08-04', type: 'earnings', marketCap: 2_900_000_000_000 }),
  ev({ symbol: 'SMALLCO', date: '2026-08-04', type: 'earnings', marketCap: 1_000_000 }),
  ev({ symbol: 'MYHOLD', date: '2026-08-04', type: 'earnings', marketCap: 5_000_000 }),
  ev({ symbol: 'NOMKTCAP', date: '2026-08-04', type: 'ipo', marketCap: null }),
];

function main() {
  // Busy day: my holding surfaces first, then the two mega-caps by market cap, rest overflow.
  const mySymbols = new Set(['MYHOLD']);
  const days = buildDayModel(events, weekDates, mySymbols, allTypes);
  const day = days.find((d) => d.date === '2026-08-04');
  if (!day) throw new Error('Expected a DayModel for 2026-08-04');
  if (day.total !== 5) throw new Error(`Expected total 5, got ${day.total}`);
  if (day.shown.length !== 3) throw new Error(`Expected 3 shown (cell limit), got ${day.shown.length}`);
  if (day.moreCount !== 2) throw new Error(`Expected moreCount 2, got ${day.moreCount}`);
  if (day.shown[0].symbol !== 'MYHOLD') throw new Error(`Expected MYHOLD shown first, got ${day.shown[0].symbol}`);
  if (day.shown[1].symbol !== 'AAPL' || day.shown[2].symbol !== 'MSFT') {
    throw new Error(`Expected AAPL then MSFT by market cap after MYHOLD, got ${day.shown.map((e) => e.symbol)}`);
  }
  if (day.mine.length !== 1 || day.others.length !== 4) {
    throw new Error(`Expected mine=1/others=4, got mine=${day.mine.length}/others=${day.others.length}`);
  }

  // Empty day.
  const emptyDay = days.find((d) => d.date === '2026-08-03');
  if (!emptyDay || emptyDay.total !== 0 || emptyDay.shown.length !== 0) {
    throw new Error('Expected an empty DayModel for 2026-08-03');
  }

  // Type filter: excluding ipo drops NOMKTCAP, leaving 4 events that day.
  const earningsOnly = buildDayModel(events, weekDates, new Set(), new Set(['earnings']));
  const filteredDay = earningsOnly.find((d) => d.date === '2026-08-04')!;
  if (filteredDay.total !== 4) throw new Error(`Expected 4 events after excluding ipo, got ${filteredDay.total}`);

  console.log('PASS: buildDayModel groups, ranks, caps, and filters correctly');
}

main();
