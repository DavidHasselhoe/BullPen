// Verifies buildDayModel: mine-first ordering, market-cap ranking of the rest,
// the 3-item cell cap + moreCount math, empty days, and type filtering.
import { buildDayModel } from '../components/tools/calendar/day-model';
import type { UnifiedEvent, EventType } from '../components/tools/calendar/types';

function ev(overrides: Pick<UnifiedEvent, 'symbol' | 'date' | 'type'> & Partial<UnifiedEvent>): UnifiedEvent {
  return { name: undefined, marketCap: null, logoUrl: null, raw: {} as never, ...overrides };
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

  // ── Per-type counts ────────────────────────────────────────────────────────
  const counted = days.find((d) => d.date === '2026-08-04')!;
  if (counted.typeCounts.earnings !== 4 || counted.typeCounts.ipo !== 1) {
    throw new Error(`Expected typeCounts earnings=4/ipo=1, got ${JSON.stringify(counted.typeCounts)}`);
  }
  console.log('PASS: typeCounts reports per-type totals for the footer strip');

  // ── Server day_totals win over what actually arrived ───────────────────────
  // The API caps rows per day, so a busy day sends fewer rows than it has.
  // "+N more" must reflect the real day, not the truncated array.
  const withTotals = buildDayModel(
    events,
    weekDates,
    new Set(),
    allTypes,
    3,
    { '2026-08-04': { earnings: 120, ipo: 1 } },
  );
  const capped = withTotals.find((d) => d.date === '2026-08-04')!;
  if (capped.total !== 121) throw new Error(`Expected server total 121, got ${capped.total}`);
  if (capped.moreCount !== 118) throw new Error(`Expected moreCount 118, got ${capped.moreCount}`);
  if (capped.typeCounts.earnings !== 120) {
    throw new Error(`Expected typeCounts.earnings 120 from server, got ${capped.typeCounts.earnings}`);
  }
  // A type the user filtered out must not inflate the total.
  const cappedFiltered = buildDayModel(
    events, weekDates, new Set(), new Set(['earnings']), 3,
    { '2026-08-04': { earnings: 120, ipo: 99 } },
  ).find((d) => d.date === '2026-08-04')!;
  if (cappedFiltered.total !== 120) {
    throw new Error(`Expected filtered-out ipo excluded from total, got ${cappedFiltered.total}`);
  }
  console.log('PASS: server day_totals drive total/moreCount and respect the type filter');

  // ── Ranking is stable across identical inputs ──────────────────────────────
  // Equal/absent market caps previously fell back to provider row order, which
  // reshuffled tiles between refetches.
  const shuffled = [...events].reverse();
  const a = buildDayModel(events, weekDates, new Set(), allTypes, 10);
  const b = buildDayModel(shuffled, weekDates, new Set(), allTypes, 10);
  const aOrder = a.find((d) => d.date === '2026-08-04')!.shown.map((e) => e.symbol).join(',');
  const bOrder = b.find((d) => d.date === '2026-08-04')!.shown.map((e) => e.symbol).join(',');
  if (aOrder !== bOrder) throw new Error(`Ranking not stable: ${aOrder} vs ${bOrder}`);
  console.log('PASS: ranking is stable regardless of input order');

  // ── Scale ──────────────────────────────────────────────────────────────────
  // A month of real per-day data is thousands of events. The previous
  // implementation re-filtered the whole list per date and sorted each day,
  // which is O(days x n); this must stay near-linear.
  const monthDates = Array.from({ length: 31 }, (_, i) => `2026-08-${String(i + 1).padStart(2, '0')}`);
  const bigEvents: UnifiedEvent[] = [];
  for (let i = 0; i < 5000; i++) {
    bigEvents.push(ev({
      symbol: `SYM${i}`,
      date: monthDates[i % monthDates.length],
      type: 'earnings',
      marketCap: (i * 7919) % 1_000_000,
    }));
  }
  const t0 = Date.now();
  const bigDays = buildDayModel(bigEvents, monthDates, new Set(['SYM42']), allTypes);
  const elapsed = Date.now() - t0;
  const totalAcross = bigDays.reduce((sum, d) => sum + d.total, 0);
  if (totalAcross !== 5000) throw new Error(`Expected all 5000 events bucketed, got ${totalAcross}`);
  for (const d of bigDays) {
    const caps = d.others.map((e) => e.marketCap ?? -1);
    for (let i = 1; i < caps.length; i++) {
      if (caps[i] > caps[i - 1]) throw new Error(`Day ${d.date} not ranked by market cap desc`);
    }
  }
  if (elapsed > 400) throw new Error(`5000 events across 31 days took ${elapsed}ms, expected well under 400ms`);
  console.log(`PASS: 5000 events x 31 days bucketed and ranked in ${elapsed}ms`);
}

main();
