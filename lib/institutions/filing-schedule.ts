/**
 * When the next 13F-HR is due.
 *
 * Rule 13f-1(a)(1) gives every institutional manager the same deadline — 45
 * days after the end of each calendar quarter — and Rule 0-3(a) pushes a
 * deadline that lands on a weekend or federal holiday to the next business
 * day (both confirmed on sec.gov/divisions/investment/13ffaq). There is no
 * per-manager schedule anywhere, at the SEC or elsewhere: a manager may file
 * any time in that 45-day window and nobody announces which day they will
 * pick.
 *
 * What the deadline is NOT is a prediction of when a given fund files. Across
 * the 79 filings this app has ingested, 72% landed exactly on the deadline
 * day, 86% within a day of it, and two arrived after it. So the deadline is
 * the honest thing to show a user ("due by"), and the near-certain thing for
 * the sync cron to be awake for.
 */

/** Quarter ends, as (month index, day) — 45 days later is the deadline. */
const QUARTER_ENDS: Array<[number, number]> = [
  [2, 31], // Mar 31 → May 15
  [5, 30], // Jun 30 → Aug 14
  [8, 30], // Sep 30 → Nov 14
  [11, 31], // Dec 31 → Feb 14
];

export interface FilingDeadline {
  /** Quarter the filing covers, as an ISO date (its last day). */
  periodOfReport: string;
  /** ISO date the 13F-HR is due, already rolled past weekends and holidays. */
  deadline: string;
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Presidents' Day, the third Monday in February.
 *
 * The only federal holiday that can ever collide with a 13F deadline: the
 * four raw deadlines are Feb 14, May 15, Aug 14 and Nov 14, and the roll
 * target is at most two days later. Feb 14 on a weekend rolls onto Feb 15 or
 * Feb 16, which fall inside Presidents' Day's Feb 15-21 range; nothing else
 * comes close. (Veterans Day is Nov 11, before the November deadline, not
 * after it.) Confirmed against real filings: Q4 2025 was due Feb 17, 2026,
 * the Tuesday after that Monday holiday, and that is exactly the date 11 of
 * our 15 funds filed.
 */
function presidentsDay(year: number): string {
  const d = new Date(Date.UTC(year, 1, 1));
  const firstMonday = 1 + ((8 - d.getUTCDay()) % 7);
  return iso(new Date(Date.UTC(year, 1, firstMonday + 14)));
}

function rollToBusinessDay(date: Date): Date {
  const out = new Date(date);
  for (;;) {
    const day = out.getUTCDay();
    if (day === 0 || day === 6 || iso(out) === presidentsDay(out.getUTCFullYear())) {
      out.setUTCDate(out.getUTCDate() + 1);
      continue;
    }
    return out;
  }
}

/** The 13F-HR deadline for the quarter ending on `periodOfReport`. */
export function deadlineForPeriod(periodOfReport: string): string {
  const d = new Date(`${periodOfReport}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 45);
  return iso(rollToBusinessDay(d));
}

/**
 * The next deadline still ahead of `from` (defaults to now), and the quarter
 * it covers. On the deadline day itself the answer is still that day — funds
 * file through the close of business, so it hasn't passed yet.
 */
export function nextFilingDeadline(from: Date = new Date()): FilingDeadline {
  const today = iso(from);
  for (let year = from.getUTCFullYear(); year <= from.getUTCFullYear() + 1; year++) {
    for (const [month, day] of QUARTER_ENDS) {
      const periodOfReport = iso(new Date(Date.UTC(year, month, day)));
      const deadline = deadlineForPeriod(periodOfReport);
      if (deadline >= today) return { periodOfReport, deadline };
    }
  }
  // Unreachable: the loop covers two full years of quarters.
  throw new Error('no upcoming 13F deadline found');
}

/** Days between `from` and a deadline, floor 0. */
export function daysUntil(deadline: string, from: Date = new Date()): number {
  const ms = new Date(`${deadline}T00:00:00Z`).getTime() - new Date(iso(from) + 'T00:00:00Z').getTime();
  return Math.max(0, Math.round(ms / 86_400_000));
}

/**
 * Is a filing wave plausibly landing right now?
 *
 * Opens 10 days before the deadline (our earliest on-time filer in five
 * quarters came 15 days early, but that was one fund once; ARK and Renaissance
 * are the habitual early birds at 1-5 days) and stays open a week past it to
 * catch stragglers and amendments.
 */
export function isInFilingWindow(from: Date = new Date()): boolean {
  const { deadline } = nextFilingDeadline(from);
  const days = daysUntil(deadline, from);
  if (days <= 10) return true;
  // Just-passed deadline: nextFilingDeadline has already moved on to the next
  // quarter, so look back at the one before it.
  const prior = new Date(from);
  prior.setUTCDate(prior.getUTCDate() - 7);
  return nextFilingDeadline(prior).deadline < iso(from);
}
