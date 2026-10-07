import { getCached, setCached } from '@/lib/cache/market-data-cache';
import { resolveCik } from '@/lib/segments/cik';
import { fetchSubmissions, fetchFiscalTagsByAccession, type EdgarFiling } from '@/lib/edgar/edgar-watch';

/**
 * A company's own fiscal calendar, from its SEC filings: which fiscal quarter
 * each period is, when its results were released, and whether the fiscal year
 * is off the calendar year.
 *
 * Why not TwelveData's fiscal_quarter/fiscal_year: its annual year is one too
 * high for every off-calendar company checked (Apple, Microsoft and Micron's
 * year ending Aug 2025 all read FY+1), and its quarterly year is one too low
 * for NVIDIA (the quarter ending Jul 2026 reads "Q2 2026"; NVIDIA calls it Q2
 * FY2027). Each 10-Q/10-K tags its own fiscal year and period on the cover
 * page, so the company's naming is read, never derived. That matters for
 * January year-ends, where Walmart names a year by its end and Home Depot by
 * its start.
 */

export interface FiscalPeriod {
  /** Exact period end from the filing. null: results released, statements not filed yet. */
  periodEnd: string | null;
  fiscalYear: number;
  /** 1-4. A 10-K's period is Q4 of its year. */
  fiscalQuarter: number;
  /** Filing date of the earnings 8-K (Item 2.02) that released these results. */
  reportedOn: string | null;
}

export interface FiscalCalendar {
  /** Fiscal year does not end in December, so labels need "FY" to avoid reading as calendar quarters. */
  offCalendar: boolean;
  /** Newest first. */
  periods: FiscalPeriod[];
}

const TTL_SEC = 12 * 60 * 60;
/** A ticker with no SEC filings (foreign filer, fund) won't grow one by tomorrow. */
const EMPTY_TTL_SEC = 7 * 24 * 60 * 60;
const DAY = 86_400_000;

const days = (a: string, b: string) => (Date.parse(a) - Date.parse(b)) / DAY;

/** "1231", a late-December 52/53-week end, or one spilling into the first days of January is a calendar year. */
export function isOffCalendar(fiscalYearEnd: string | null): boolean {
  if (!fiscalYearEnd || fiscalYearEnd.length !== 4) return false;
  const mm = fiscalYearEnd.slice(0, 2);
  return !(mm === '12' || (mm === '01' && fiscalYearEnd.slice(2) <= '07'));
}

/** Pure, so the test can feed it recorded SEC responses. */
export function buildFiscalCalendar(
  fiscalYearEnd: string | null,
  filings: EdgarFiling[],
  tags: Map<string, { fy: number; fp: string }>,
): FiscalCalendar {
  const releases = filings
    .filter((f) => f.form === '8-K' && f.items.split(',').includes('2.02'))
    .map((f) => f.filingDate)
    .sort();

  const periods: FiscalPeriod[] = [];
  for (const f of filings) {
    if ((f.form !== '10-Q' && f.form !== '10-K') || !f.reportDate) continue;
    const tag = tags.get(f.accessionNumber);
    const quarter = tag?.fp === 'FY' ? 4 : Number(tag?.fp?.slice(1));
    if (!tag || !(quarter >= 1 && quarter <= 4)) continue;
    if (periods.some((p) => p.periodEnd === f.reportDate)) continue; // an amendment of a period already seen
    // The release is the last earnings 8-K between period end and the filing
    // (a pre-announcement can come first); else the first one after it.
    const between = releases.filter((d) => d > f.reportDate && d <= f.filingDate);
    const after = releases.find((d) => d > f.reportDate && days(d, f.reportDate) <= 120);
    periods.push({
      periodEnd: f.reportDate,
      fiscalYear: tag.fy,
      fiscalQuarter: quarter,
      reportedOn: between.at(-1) ?? after ?? null,
    });
  }
  periods.sort((a, b) => b.periodEnd!.localeCompare(a.periodEnd!));

  // Results released after the newest filing, for a quarter that has ended:
  // Micron released Q4 FY26 on Sep 30 2026 with the 10-K weeks away. 80 days
  // keeps a stray mid-quarter 2.02 (a guidance update) from passing as one.
  const newest = periods[0];
  if (newest) {
    const pending = releases.filter((d) => d > (newest.reportedOn ?? newest.periodEnd!) && days(d, newest.periodEnd!) >= 80).at(-1);
    if (pending) {
      const q4 = newest.fiscalQuarter === 4;
      periods.unshift({
        periodEnd: null,
        fiscalYear: q4 ? newest.fiscalYear + 1 : newest.fiscalYear,
        fiscalQuarter: q4 ? 1 : newest.fiscalQuarter + 1,
        reportedOn: pending,
      });
    }
  }

  return { offCalendar: isOffCalendar(fiscalYearEnd), periods };
}

/** Null when SEC has nothing for this ticker or can't be reached; callers keep their own labels then. */
export async function getFiscalCalendar(ticker: string): Promise<FiscalCalendar | null> {
  const symbol = ticker.toUpperCase();
  const key = `sec:fiscal-calendar:${symbol}`;
  const cached = await getCached<FiscalCalendar>(key);
  if (cached) return cached.periods.length ? cached : null;

  const cik = await resolveCik(symbol);
  if (!cik) {
    void setCached(key, symbol, 'fiscal_calendar', { offCalendar: false, periods: [] }, EMPTY_TTL_SEC);
    return null;
  }
  try {
    const [{ fiscalYearEnd, filings }, tags] = await Promise.all([fetchSubmissions(cik), fetchFiscalTagsByAccession(cik)]);
    const calendar = buildFiscalCalendar(fiscalYearEnd, filings, tags);
    void setCached(key, symbol, 'fiscal_calendar', calendar, calendar.periods.length ? TTL_SEC : EMPTY_TTL_SEC);
    return calendar.periods.length ? calendar : null;
  } catch {
    return null; // SEC unreachable: not cached, try again next request
  }
}

/**
 * The filed period a statement row covers. TwelveData rounds period ends to
 * the month (Micron's May 28 reads May 31), and quarters sit ~91 days apart,
 * so the nearest filed period within a month is the one.
 */
export function periodForStatement(calendar: FiscalCalendar, fiscalDate: string, annual: boolean): FiscalPeriod | null {
  let best: FiscalPeriod | null = null;
  for (const p of calendar.periods) {
    if (!p.periodEnd || (annual && p.fiscalQuarter !== 4)) continue;
    const gap = Math.abs(days(p.periodEnd, fiscalDate));
    if (gap <= 31 && (!best || gap < Math.abs(days(best.periodEnd!, fiscalDate)))) best = p;
  }
  return best;
}

/**
 * The period an earnings release covers. EDGAR dates a filing made after
 * 5:30pm ET the next business day, so an 8-K can trail the release by a day
 * (three over a weekend).
 */
export function periodForRelease(calendar: FiscalCalendar, releaseDate: string): FiscalPeriod | null {
  return calendar.periods.find((p) => p.reportedOn && days(p.reportedOn, releaseDate) >= 0 && days(p.reportedOn, releaseDate) <= 3) ?? null;
}

/**
 * Earnings rows renamed to the company's own fiscal quarter, matched on the
 * release date. Upcoming rows count on from the newest release. A row SEC
 * has no release for (older than its filing list) keeps its label.
 */
export function labelEarnings<T extends { date: string; quarter: number | null; year: number | null }>(
  rows: T[],
  calendar: FiscalCalendar | null,
): (T & { offCalendar?: boolean })[] {
  if (!calendar) return rows;
  const newest = calendar.periods.find((p) => p.reportedOn);
  const upcoming = newest
    ? rows.filter((r) => r.date > newest.reportedOn! && !periodForRelease(calendar, r.date)).map((r) => r.date).sort()
    : [];
  return rows.map((row) => {
    const p = periodForRelease(calendar, row.date);
    if (p) return { ...row, quarter: p.fiscalQuarter, year: p.fiscalYear, offCalendar: calendar.offCalendar };
    const ahead = upcoming.indexOf(row.date) + 1;
    if (newest && ahead > 0) {
      const n = newest.fiscalQuarter - 1 + ahead;
      return { ...row, quarter: (n % 4) + 1, year: newest.fiscalYear + Math.floor(n / 4), offCalendar: calendar.offCalendar };
    }
    return { ...row, offCalendar: calendar.offCalendar };
  });
}

/** English label for model prompts ("Q3 FY26", "Q3 2026"). The UI formats its own, translated. */
export function fiscalLabelEn(p: { fiscalQuarter: number; fiscalYear: number }, offCalendar: boolean): string {
  return offCalendar ? `Q${p.fiscalQuarter} FY${String(p.fiscalYear).slice(2)}` : `Q${p.fiscalQuarter} ${p.fiscalYear}`;
}
