/**
 * Checks for the stock chart's intraday x-axis (lib/charts/intraday-axis.ts):
 * 5D trims to five trading days, ticks land on day / session starts, and the
 * spacing rule drops a tick that would collide with its neighbour.
 *   npx tsx scripts/test-intraday-axis.ts
 */
import assert from 'node:assert';
import { etDayKey, intradayAxis, lastTradingDays } from '../lib/charts/intraday-axis';

type S = 'pre' | 'regular' | 'post';
const et = (date: string, hhmm: string) => Math.floor(new Date(`${date}T${hhmm}:00-04:00`).getTime() / 1000);
const sessionOf = (mins: number): S => (mins < 570 ? 'pre' : mins >= 960 ? 'post' : 'regular');

/** 5-min bars 04:00-19:55 ET for one day. */
function day(date: string) {
  const pts: { time: number; session: S }[] = [];
  for (let m = 240; m < 1200; m += 5) {
    const hh = String(Math.floor(m / 60)).padStart(2, '0');
    const mm = String(m % 60).padStart(2, '0');
    pts.push({ time: et(date, `${hh}:${mm}`), session: sessionOf(m) });
  }
  return pts;
}

// 7 calendar days, Fri Oct 9 → Fri Oct 16 2026, as the candles route fetches them.
const week = ['2026-10-09', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16'].flatMap(day);
const five = lastTradingDays(week, 5);
assert.deepEqual([...new Set(five.map((p) => etDayKey(p.time)))], ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16']);

const w = intradayAxis(five, '1W');
assert.deepEqual(w.ticks.map((t) => t.label), ['Mon 12', 'Tue 13', 'Wed 14', 'Thu 15', 'Fri 16']);
assert.equal(w.dividers.length, 4);

// 1D: ticks at pre-market, the open, after hours; rules at the open and the close.
const d = intradayAxis(day('2026-10-16'), '1D');
assert.equal(d.ticks.length, 3);
assert.deepEqual(d.dividers.map((x) => x.getTime() / 1000), [et('2026-10-16', '09:30'), et('2026-10-16', '16:00')]);

// Data that starts one bar before the open: the open's label would print on top of
// pre-market's, so the rule stays but the second label goes.
const late = day('2026-10-16').filter((p) => p.time >= et('2026-10-16', '09:25') && p.time < et('2026-10-16', '16:00'));
const e = intradayAxis(late, '1D');
assert.equal(e.ticks.length, 1);
assert.equal(e.dividers.length, 1);

// Regular session only (extended hours hidden): five evenly spaced time labels, no rules.
const reg = intradayAxis(day('2026-10-16').filter((p) => p.session === 'regular'), '1D');
assert.equal(reg.ticks.length, 5);
assert.equal(reg.dividers.length, 0);

console.log('intraday-axis: all checks passed');
