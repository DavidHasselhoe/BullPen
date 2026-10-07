/**
 * The fiscal calendar read from SEC filings, against live EDGAR (free).
 * Each case is one a date rule or TwelveData's fields got wrong.
 *
 *   npm run test-fiscal-calendar
 */
import assert from 'node:assert/strict';
import { fetchSubmissions, fetchFiscalTagsByAccession } from '../lib/edgar/edgar-watch';
import { buildFiscalCalendar, periodForStatement, periodForRelease, fiscalLabelEn, labelEarnings } from '../lib/finance/fiscal-calendar';

async function calendarFor(cik: string) {
  const [{ fiscalYearEnd, filings }, tags] = await Promise.all([fetchSubmissions(cik), fetchFiscalTagsByAccession(cik)]);
  return buildFiscalCalendar(fiscalYearEnd, filings, tags);
}

const label = (p: { fiscalQuarter: number; fiscalYear: number } | null, off: boolean) => (p ? fiscalLabelEn(p, off) : null);

async function main() {
  // Micron: fiscal year ends early September. TwelveData rounds the May 28 2026
  // period to May 31; the Revenue Flow chart called it "Q2 2026".
  const mu = await calendarFor('723125');
  assert.equal(mu.offCalendar, true);
  const muQ3 = periodForStatement(mu, '2026-05-31', false);
  assert.equal(label(muQ3, true), 'Q3 FY26');
  assert.equal(muQ3?.periodEnd, '2026-05-28');
  assert.equal(muQ3?.reportedOn, '2026-06-24');
  assert.equal(label(periodForRelease(mu, '2026-06-24'), true), 'Q3 FY26');
  assert.equal(label(periodForRelease(mu, '2025-12-17'), true), 'Q1 FY26');
  // Annual: TwelveData says FY2026 for the year ending Aug 2025.
  assert.equal(periodForStatement(mu, '2025-08-31', true)?.fiscalYear, 2025);
  assert.equal(periodForRelease(mu, '2025-09-23')?.fiscalYear, 2025);
  // Q4 FY26 was released Sep 30 2026; the 10-K was not filed when this was written.
  // Once it is, the same release maps to the filed period instead. Either way: Q4 FY26.
  assert.equal(label(periodForRelease(mu, '2026-09-30'), true), 'Q4 FY26');

  // NVIDIA: TwelveData calls the quarter ending Jul 2026 "Q2 2026".
  const nvda = await calendarFor('1045810');
  assert.equal(nvda.offCalendar, true);
  assert.equal(label(periodForStatement(nvda, '2026-07-31', false), true), 'Q2 FY27');
  assert.equal(label(periodForStatement(nvda, '2026-01-31', false), true), 'Q4 FY26');
  assert.equal(periodForRelease(nvda, '2026-08-26')?.periodEnd, '2026-07-26');

  // Home Depot names a year by its START: the year ending Feb 1 2026 is fiscal 2025.
  // A "year it ends in" rule would say 2026.
  const hd = await calendarFor('354950');
  const hdYear = periodForStatement(hd, '2026-01-31', true);
  assert.equal(hdYear?.fiscalYear, 2025, `Home Depot year ending ${hdYear?.periodEnd} read as FY${hdYear?.fiscalYear}`);

  // A calendar-year company keeps plain labels.
  const jpm = await calendarFor('19617');
  assert.equal(jpm.offCalendar, false);
  assert.equal(label(periodForStatement(jpm, '2026-06-30', false), false), 'Q2 2026');

  // Earnings rows: matched on release date, upcoming ones count on from the newest.
  const rows = labelEarnings([
    { date: '2026-12-16', quarter: 3, year: 2026 }, // upcoming, TwelveData's guess
    { date: '2026-09-30', quarter: 2, year: 2026 }, // the snapshot cache's calendar guess
    { date: '2026-06-24', quarter: 3, year: 2026 },
  ], mu);
  assert.deepEqual(rows.map((r) => fiscalLabelEn({ fiscalQuarter: r.quarter!, fiscalYear: r.year! }, true)), ['Q1 FY27', 'Q4 FY26', 'Q3 FY26']);

  console.log('fiscal calendar: ok');
}

main().catch((err) => { console.error(err); process.exit(1); });
