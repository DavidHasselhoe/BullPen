/**
 * Asserts the economic-calendar parsing that would fail silently if it broke:
 * DST-correct ET conversion, ICS line folding, which BLS releases count, and
 * the jobless-claims holiday shift. `--live` also fetches the real feeds.
 *
 *   npm run test-economic-calendar [-- --live]
 */
import assert from 'node:assert/strict';
import { etToIso, parseIcs, blsRows, beaRows, claimsRows, fomcRows } from '../lib/market-data/economic-calendar';

// 8:30 ET is 12:30Z in summer (EDT) and 13:30Z in winter (EST).
assert.equal(etToIso('2026-10-02', '08:30'), '2026-10-02T12:30:00.000Z');
assert.equal(etToIso('2026-12-04', '08:30'), '2026-12-04T13:30:00.000Z');

const bls = parseIcs([
  'BEGIN:VCALENDAR',
  'BEGIN:VEVENT', 'DTSTART;TZID=US-Eastern:20261002T083000', 'SUMMARY:Employment Situation', 'END:VEVENT',
  'BEGIN:VEVENT', 'DTSTART;TZID=US-Eastern:20261014T083000', 'SUMMARY:Consumer Price Index', 'END:VEVENT',
  'BEGIN:VEVENT', 'DTSTART;TZID=US-Eastern:20261020T100000', 'SUMMARY:State Job Openings and Labor Turnover', 'END:VEVENT',
  'BEGIN:VEVENT', 'DTSTART;TZID=US-Eastern:20260924T100000', 'SUMMARY:Employee Tenure', 'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n'));
const blsOut = blsRows(bls);
assert.deepEqual(blsOut.map((r) => r.id), ['jobs:2026-10-02', 'cpi:2026-10-14'], 'only the curated BLS releases');
assert.equal(blsOut[0].release_at, '2026-10-02T12:30:00.000Z');

const bea = parseIcs([
  'BEGIN:VEVENT', 'DTSTART:20261029T123000Z', 'SUMMARY:GDP (Advance Estimate)\\, 3rd Quarter 2026', 'END:VEVENT',
  // Folded line: the continuation starts with a space.
  'BEGIN:VEVENT', 'DTSTART;VALUE=DATE-TIME:20260930T123000Z', 'SUMMARY:GDP (Third Estimate)\\, Industries\\, Corporate Profits\\, State GDP\\',
  ' , 2nd Quarter 2026', 'END:VEVENT',
  'BEGIN:VEVENT', 'DTSTART:20261029T123000Z', 'SUMMARY:Personal Income and Outlays\\, September 2026', 'END:VEVENT',
  'BEGIN:VEVENT', 'DTSTART:20261006T123000Z', 'SUMMARY:U.S. International Trade in Goods and Services\\, August 2026', 'END:VEVENT',
].join('\r\n'));
const beaOut = beaRows(bea);
assert.deepEqual(
  beaOut.map((r) => [r.id, r.detail]),
  [
    ['gdp:2026-10-29', 'Advance Estimate, 3rd Quarter 2026'],
    ['gdp:2026-09-30', 'Third Estimate'],
    ['pce:2026-10-29', 'September 2026'],
  ],
);

// Thanksgiving 2026 is Thursday Nov 26: claims move to Wednesday the 25th.
const claims = claimsRows('2026-11-16', '2026-12-04').map((r) => r.date);
assert.deepEqual(claims, ['2026-11-19', '2026-11-25', '2026-12-03']);

const fomc = fomcRows();
assert.equal(fomc.find((r) => r.date === '2026-10-28')?.release_at, '2026-10-28T18:00:00.000Z', '2:00 PM EDT');
assert.equal(fomc.filter((r) => r.has_projections).length, 8);

async function live() {
  const ua = { 'User-Agent': 'Mozilla/5.0 (compatible; BullPen economic calendar; +https://bullpen.no)' };
  for (const [name, url, rows] of [
    ['BLS', 'https://www.bls.gov/schedule/news_release/bls.ics', blsRows],
    ['BEA', 'https://www.bea.gov/news/schedule/ics/online-calendar-subscription.ics', beaRows],
  ] as const) {
    const res = await fetch(url, { headers: ua });
    const parsed = rows(parseIcs(await res.text()));
    const upcoming = parsed.filter((r) => r.date >= new Date().toISOString().slice(0, 10));
    console.log(`${name}: HTTP ${res.status}, ${parsed.length} curated rows, next: ${upcoming.slice(0, 3).map((r) => r.id).join(', ')}`);
    assert.ok(upcoming.length > 0, `${name} has upcoming releases`);
  }
}

(process.argv.includes('--live') ? live() : Promise.resolve()).then(() => console.log('economic calendar checks passed'));
