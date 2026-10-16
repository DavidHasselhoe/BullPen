/**
 * Checks for the stock chart's intraday x-axis (lib/charts/intraday-axis.ts):
 * 5D trims to five trading days, ticks land on day / session starts, and the
 * spacing rule drops a tick that would collide with its neighbour.
 *   npx tsx scripts/test-intraday-axis.ts
 */
import assert from 'node:assert';
import { etDayKey, intradayAxis, lastTradingDays } from '../lib/charts/intraday-axis';
import { fmtMonthDay, fmtTradingDate, languageUsesHour12, resolveTimeZone, type Clock } from '../lib/dates/clock';

const OSLO: Clock = { timeZone: 'Europe/Oslo', hour12: false, locale: 'en-US' };
const NEW_YORK: Clock = { timeZone: 'America/New_York', hour12: true, locale: 'en-US' };

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

const w = intradayAxis(five, '1W', OSLO);
assert.deepEqual(w.ticks.map((t) => t.label), ['Mon 12', 'Tue 13', 'Wed 14', 'Thu 15', 'Fri 16']);
assert.equal(w.dividers.length, 4);

// 1D: ticks at pre-market, the open, after hours; rules at the open and the close.
const d = intradayAxis(day('2026-10-16'), '1D', OSLO);
assert.equal(d.ticks.length, 3);
assert.deepEqual(d.dividers.map((x) => x.getTime() / 1000), [et('2026-10-16', '09:30'), et('2026-10-16', '16:00')]);
// On the user's clock: the open is 15:30 in Oslo (24h), 9:30 AM in New York (12h).
assert.equal(d.ticks[1].label, '15:30');
assert.equal(intradayAxis(day('2026-10-16'), '1D', NEW_YORK).ticks[1].label, '9:30 AM');

// Data that starts one bar before the open: the open's label would print on top of
// pre-market's, so the rule stays but the second label goes.
const late = day('2026-10-16').filter((p) => p.time >= et('2026-10-16', '09:25') && p.time < et('2026-10-16', '16:00'));
const e = intradayAxis(late, '1D', OSLO);
assert.equal(e.ticks.length, 1);
assert.equal(e.dividers.length, 1);

// Regular session only (extended hours hidden): five evenly spaced time labels, no rules.
const reg = intradayAxis(day('2026-10-16').filter((p) => p.session === 'regular'), '1D', OSLO);
assert.equal(reg.ticks.length, 5);
assert.equal(reg.dividers.length, 0);

// The clock the labels come from (lib/dates/clock): 12/24h by app language,
// and the time zone setting.
assert.equal(languageUsesHour12('en'), true);
assert.equal(languageUsesHour12('qa'), true);
for (const lang of ['no', 'de', 'fr', 'es', 'ja', 'zh']) assert.equal(languageUsesHour12(lang), false, lang);
assert.equal(resolveTimeZone(undefined), undefined);
assert.equal(resolveTimeZone('auto'), undefined);
assert.equal(resolveTimeZone('market'), 'America/New_York');
assert.equal(resolveTimeZone('Asia/Tokyo'), 'Asia/Tokyo');
assert.equal(resolveTimeZone('Mars/Olympus'), undefined);

// A daily bar is stamped at midnight New York; read on a Chicago clock that is
// still Oct 14. Trading dates must not move with the viewer.
const CHICAGO: Clock = { timeZone: 'America/Chicago', hour12: true, locale: 'en-US' };
const oct15Bar = new Date(et('2026-10-15', '00:00') * 1000);
assert.equal(fmtTradingDate(oct15Bar, { weekday: 'short', month: 'short', day: 'numeric' }, CHICAGO), 'Thu, Oct 15');

// Norwegian: 24-hour times, translated day names ("12." is how Norwegian writes the day),
// and the pill keeps month-then-day.
const NORSK: Clock = { timeZone: 'Europe/Oslo', hour12: false, locale: 'nb' };
assert.equal(intradayAxis(five, '1W', NORSK).ticks[0].label, 'man. 12.');
assert.equal(intradayAxis(day('2026-10-16'), '1D', NORSK).ticks[1].label, '15:30');
assert.equal(fmtMonthDay(oct15Bar, 'America/New_York', NORSK), 'okt. 15');

console.log('intraday-axis: all checks passed');
