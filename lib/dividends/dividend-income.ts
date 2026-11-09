/**
 * Dividend income math for the holdings dividend hub. Pure, no I/O.
 *
 * Every number here comes from a real payment record. "Announced" rows are
 * payments the company has declared (or already made); "projected" rows repeat
 * a holding's last 12 months of payment dates one year later, at its most
 * recent real amount (a raise carries forward; nothing is estimated from
 * yield or growth rates).
 *
 * Self-check: npx tsx lib/dividends/dividend-income.ts
 */

export interface DividendEvent {
  exDate: string;          // YYYY-MM-DD
  payDate: string | null;  // YYYY-MM-DD, null when the source has none
  amount: number;          // per share, USD
}

export interface IncomeEntry {
  symbol: string;
  exDate: string;
  payDate: string | null;
  /** The day the money arrives when known, else the ex-date. Drives the month bucket. */
  date: string;
  perShare: number;
  /** Per-share amount times the user's shares; null when the holding has no share count. */
  total: number | null;
  kind: 'announced' | 'projected';
}

const DAY_MS = 86_400_000;
const daysBetween = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / DAY_MS;
const dateOf = (e: { exDate: string; payDate: string | null }) => e.payDate ?? e.exDate;
/** A company that hasn't paid in this long has stopped; don't project its old payments forward. */
const STALE_DAYS = 14 * 30.44;

/** Same day one year later (Feb 29 becomes Feb 28). */
export function addYear(d: string): string {
  const y = Number(d.slice(0, 4)) + 1;
  const md = d.slice(5) === '02-29' ? '02-28' : d.slice(5);
  return `${y}-${md}`;
}

/** First day of the month `n` months after the month containing `d`. */
function monthStartPlus(d: string, n: number): string {
  const dt = new Date(Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1 + n, 1));
  return dt.toISOString().slice(0, 10);
}

/**
 * Valid, de-duplicated payments, newest first, without one-offs. TwelveData
 * books spin-offs as cash dividends (HON's $115.89 against ~$1.19 quarterly),
 * and a special isn't recurring income, so a payment over 5x the ones on both
 * sides of it goes. Against neighbours, not the median: years of small payments
 * made NVDA's real raise ($0.01 to $0.25, June 2026) look like a special. A
 * raise that is still the newest payment has only one neighbour and counts
 * from its second payment, since projecting a special forward is the worse error.
 */
export function regularPayments(events: DividendEvent[]): DividendEvent[] {
  const seen = new Set<string>();
  const valid = events
    .filter((e) => e.amount > 0 && /^\d{4}-\d{2}-\d{2}$/.test(e.exDate))
    .filter((e) => (seen.has(e.exDate) ? false : (seen.add(e.exDate), true)))
    .sort((a, b) => b.exDate.localeCompare(a.exDate));
  return valid.filter((e, i) => {
    const neighbours = [valid[i - 1], valid[i + 1]].filter(Boolean);
    return neighbours.length === 0 || neighbours.some((n) => e.amount <= n.amount * 5);
  });
}

/** The next payment a holder gets: the earliest one whose money hasn't arrived yet. */
export function nextPayment(events: DividendEvent[], today: string): DividendEvent | null {
  const upcoming = regularPayments(events).filter((e) => dateOf(e) >= today);
  return upcoming.length ? upcoming[upcoming.length - 1] : null;
}

/** The most recent payment already made (or, with no pay date, already past its ex-date). */
export function lastPayment(events: DividendEvent[], today: string): DividendEvent | null {
  return regularPayments(events).find((e) => dateOf(e) < today) ?? null;
}

/** Pays now: has a payment coming, or paid within the stale window. */
export function isActivePayer(events: DividendEvent[], today: string): boolean {
  const reg = regularPayments(events);
  return reg.length > 0 && (dateOf(reg[0]) >= today || daysBetween(reg[0].exDate, today) <= STALE_DAYS);
}

/** Payments per year from the median gap between recent ex-dates; null with under two payments. */
export function paymentsPerYear(past: DividendEvent[]): number | null {
  const recent = past.slice(0, 9);
  if (recent.length < 2) return null;
  const gaps = recent.slice(1).map((e, i) => daysBetween(e.exDate, recent[i].exDate)).sort((a, b) => a - b);
  const gap = gaps[Math.floor(gaps.length / 2)];
  return gap <= 45 ? 12 : gap <= 100 ? 4 : gap <= 200 ? 2 : 1;
}

/**
 * One holding's payments over the 12 calendar months starting with the month
 * of `today`. Announced payments in that window come as they are. On top, the
 * last full cycle of past payment dates is repeated a year later at the latest
 * amount, unless an
 * announced payment already fills that slot or the date has already passed.
 */
export function holdingYear(symbol: string, events: DividendEvent[], shares: number | null, today: string): IncomeEntry[] {
  const from = monthStartPlus(today, 0);
  const to = monthStartPlus(today, 12);
  const reg = regularPayments(events);
  const entry = (e: DividendEvent, kind: IncomeEntry['kind']): IncomeEntry => ({
    symbol, exDate: e.exDate, payDate: e.payDate, date: dateOf(e), perShare: e.amount,
    total: shares != null ? e.amount * shares : null, kind,
  });

  const out = reg.filter((e) => dateOf(e) >= from && dateOf(e) < to).map((e) => entry(e, 'announced'));

  const past = reg.filter((e) => e.exDate < today);
  const freq = paymentsPerYear(past);
  if (!freq || daysBetween(past[0].exDate, today) > STALE_DAYS) return out;

  const halfGap = 365 / freq / 2;
  for (const e of past.slice(0, freq)) {
    const p: DividendEvent = { exDate: addYear(e.exDate), payDate: e.payDate ? addYear(e.payDate) : null, amount: reg[0].amount };
    const d = dateOf(p);
    if (d < today || d >= to) continue;
    if (reg.some((r) => Math.abs(daysBetween(r.exDate, p.exDate)) < halfGap)) continue;
    out.push(entry(p, 'projected'));
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export interface IncomeMonth {
  month: string; // YYYY-MM
  total: number;
  entries: IncomeEntry[];
}

/** Twelve month buckets from the month of `today`, each with its entries and total (entries without a share count add nothing). */
export function incomeMonths(entries: IncomeEntry[], today: string): IncomeMonth[] {
  return Array.from({ length: 12 }, (_, i) => {
    const month = monthStartPlus(today, i).slice(0, 7);
    const inMonth = entries.filter((e) => e.date.startsWith(month)).sort((a, b) => a.date.localeCompare(b.date));
    return { month, total: inMonth.reduce((s, e) => s + (e.total ?? 0), 0), entries: inMonth };
  });
}

// ── Self-check ───────────────────────────────────────────────────────────────
if (process.argv[1]?.endsWith('dividend-income.ts')) {
  const assert = (ok: boolean, label: string) => { if (!ok) { console.error('FAIL', label); process.exit(1); } console.log('ok  ', label); };
  const close = (a: number, b: number) => Math.abs(a - b) < 1e-9;

  // AAPL as TwelveData + Nasdaq returned it on 2026-11-06: Nov 12 declared, earlier ones paid.
  const aapl: DividendEvent[] = [
    { exDate: '2026-11-12', payDate: '2026-11-16', amount: 0.27 },
    { exDate: '2026-08-10', payDate: '2026-08-13', amount: 0.27 },
    { exDate: '2026-05-11', payDate: '2026-05-14', amount: 0.27 },
    { exDate: '2026-02-09', payDate: '2026-02-12', amount: 0.26 },
    { exDate: '2025-11-10', payDate: '2025-11-13', amount: 0.26 },
    { exDate: '2025-08-11', payDate: '2025-08-14', amount: 0.26 },
  ];
  const today = '2026-11-06';
  const year = holdingYear('AAPL', aapl, 10, today);
  assert(year.length === 4, 'quarterly payer: four payments in 12 months');
  assert(year[0].kind === 'announced' && year[0].date === '2026-11-16', 'declared Nov payment kept, not doubled by last Nov');
  assert(year.slice(1).every((e) => e.kind === 'projected'), 'the other three are projections');
  assert(year.map((e) => e.date).join() === '2026-11-16,2027-02-12,2027-05-14,2027-08-13', 'projected on last year\'s pay dates');
  assert(close(year.reduce((s, e) => s + (e.total ?? 0), 0), 10 * 0.27 * 4), 'projections use the latest real amount (0.27, not last Feb 0.26)');
  assert(nextPayment(aapl, today)?.exDate === '2026-11-12', 'next payment is the declared one');
  assert(lastPayment(aapl, today)?.exDate === '2026-08-10', 'last payment is August');

  // Paid earlier this month: it stays in the year as announced, last year's copy doesn't project.
  const paidThisMonth = holdingYear('AAPL', aapl, 10, '2026-11-20');
  assert(paidThisMonth.length === 4 && paidThisMonth[0].date === '2026-11-16', 'payment earlier this month still counts');

  // No pay dates (NYSE names): bucketed by ex-date.
  const ko = [
    { exDate: '2026-09-15', payDate: null, amount: 0.53 },
    { exDate: '2026-06-15', payDate: null, amount: 0.53 },
    { exDate: '2026-03-13', payDate: null, amount: 0.53 },
    { exDate: '2025-11-28', payDate: null, amount: 0.51 },
  ];
  const koYear = holdingYear('KO', ko, null, today);
  assert(koYear.length === 4 && koYear[0].date === '2026-11-28' && koYear[0].perShare === 0.53, 'ex-date stands in for a missing pay date');
  assert(koYear.every((e) => e.total === null), 'no share count, no user amount');
  assert(incomeMonths(koYear, today).reduce((s, m) => s + m.total, 0) === 0, 'null totals add nothing');

  // A spin-off booked as cash is not income.
  const hon = [
    { exDate: '2026-08-15', payDate: null, amount: 1.19 },
    { exDate: '2026-06-29', payDate: null, amount: 115.89 },
    { exDate: '2026-05-15', payDate: null, amount: 1.19 },
    { exDate: '2026-02-13', payDate: null, amount: 1.13 },
    { exDate: '2025-11-14', payDate: null, amount: 1.13 },
  ];
  assert(holdingYear('HON', hon, 1, today).every((e) => e.perShare < 2), 'spin-off dropped');

  // NVDA as cached on 2026-11-09: a 25x raise is the new normal, not a special.
  const nvda: DividendEvent[] = [
    { exDate: '2026-09-10', payDate: '2026-10-01', amount: 0.25 },
    { exDate: '2026-06-04', payDate: '2026-06-26', amount: 0.25 },
    { exDate: '2026-03-11', payDate: '2026-04-01', amount: 0.01 },
    { exDate: '2025-12-04', payDate: '2025-12-26', amount: 0.01 },
    { exDate: '2025-09-11', payDate: '2025-10-02', amount: 0.01 },
  ];
  assert(lastPayment(nvda, '2026-11-09')?.amount === 0.25, 'a real raise stays in the record');
  assert(holdingYear('NVDA', nvda, 10, '2026-11-09').every((e) => e.perShare === 0.25), 'projections use the raised amount');
  assert(regularPayments(nvda.slice(2).concat()).length === 3, 'small steady payments all stay');
  assert(regularPayments([{ exDate: '2026-09-10', payDate: null, amount: 3 }, ...nvda.slice(2)])[0].amount === 0.01, 'a lone newest jump waits for a second payment');

  // Stopped paying: nothing projected.
  const stopped = [{ exDate: '2025-03-01', payDate: null, amount: 0.5 }, { exDate: '2024-12-01', payDate: null, amount: 0.5 }];
  assert(holdingYear('X', stopped, 5, today).length === 0, 'stale payer projects nothing');
  assert(!isActivePayer(stopped, today) && isActivePayer(ko, today), 'stale payer is not listed as paying');

  // One payment ever: frequency unknown, nothing invented.
  assert(holdingYear('Y', [{ exDate: '2026-10-01', payDate: null, amount: 1 }], 5, today).length === 0, 'single payment projects nothing');

  // Monthly payer: twelve entries, one per month.
  const monthly: DividendEvent[] = Array.from({ length: 13 }, (_, i) => ({
    exDate: monthStartPlus('2026-10-01', -i).slice(0, 8) + '01', payDate: monthStartPlus('2026-10-01', -i).slice(0, 8) + '15', amount: 0.25,
  }));
  const months = incomeMonths(holdingYear('O', monthly, 4, today), today);
  assert(months.length === 12 && months.every((m) => m.entries.length === 1 && close(m.total, 1)), 'monthly payer fills all 12 months');
  // Entries arrive grouped by holding; a month reads in date order across them.
  const mixed = [{ ...koYear[0], symbol: 'B', date: '2026-12-26' }, { ...koYear[0], symbol: 'A', date: '2026-12-11' }];
  assert(incomeMonths(mixed, today)[1].entries[0].symbol === 'A', 'month entries sorted by date across holdings');
  console.log('dividend-income self-check passed');
}
