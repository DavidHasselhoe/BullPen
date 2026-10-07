import type { TFunction } from 'i18next';

/**
 * The company's own name for a period, attached to statement and earnings rows
 * by the API (lib/finance/fiscal-calendar.ts, from SEC filings). Every place
 * the stock page names a quarter formats it here, so Earnings, Revenue Flow and
 * Financials can never call the same quarter different things.
 */
export interface FiscalTag {
  /** null on an annual row. */
  quarter: number | null;
  year: number;
  /** Fiscal year doesn't end in December: label as "Q3 FY26" so it can't read as a calendar quarter. */
  offCalendar: boolean;
  /** Exact period end from the filing. */
  periodEnd: string | null;
  /** When the results were released (earnings 8-K). */
  reportedOn: string | null;
}

/** "Q3 FY26" off-calendar, "Q3 2026" otherwise; "FY2025" / "2025" for a year. */
export function fiscalLabel(t: TFunction, f: { quarter: number | null; year: number; offCalendar?: boolean }): string {
  if (f.quarter == null) return f.offCalendar ? t('fiscalYearLabel', { year: f.year }) : String(f.year);
  return f.offCalendar
    ? t('fiscalQuarterLabel', { quarter: f.quarter, year: String(f.year).slice(2) })
    : t('earningsQuarterYear', { quarter: f.quarter, year: f.year });
}

interface ReportLike {
  date: string;
  quarter: number | null;
  year: number | null;
  offCalendar?: boolean;
  epsActual?: number | null;
}

/**
 * The same release date the Earnings card shows for this row's quarter, so a
 * Financials column and an Earnings row never give one quarter two dates. SEC's
 * 8-K date only when Earnings has no row for it.
 */
export function reportedOnFor(row: { fiscal?: FiscalTag | null }, earnings: ReportLike[] | undefined): string | null {
  const f = row.fiscal;
  if (!f) return null;
  const quarter = f.quarter ?? 4;
  return earnings?.find((e) => e.year === f.year && e.quarter === quarter && e.epsActual != null)?.date ?? f.reportedOn;
}

/**
 * The newest released quarter whose statements aren't in `rows` yet: results
 * are announced weeks before the 10-Q/10-K is filed (Micron released Q4 FY26
 * on Sep 30 2026; the 10-K came later). An annual view only waits on a Q4.
 */
export function pendingReport(
  earnings: ReportLike[] | undefined,
  newestRow: { fiscal_date: string; fiscal?: FiscalTag | null } | undefined,
  annual: boolean,
): { quarter: number; year: number; offCalendar?: boolean; date: string } | null {
  if (!earnings?.length || !newestRow) return null;
  const today = new Date().toISOString().slice(0, 10);
  const report = earnings
    .filter((e) => e.date < today && e.quarter != null && e.year != null)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  if (!report || (annual && report.quarter !== 4)) return null;
  const f = newestRow.fiscal;
  const behind = f
    ? report.year! * 4 + report.quarter! > f.year * 4 + (f.quarter ?? 4)
    : !annual && (Date.parse(report.date) - Date.parse(newestRow.fiscal_date)) / 86_400_000 > 95;
  return behind ? { quarter: report.quarter!, year: report.year!, offCalendar: report.offCalendar, date: report.date } : null;
}

/**
 * A statement row's label. Rows SEC couldn't place (foreign filers, funds)
 * fall back to the calendar quarter of the period end, the same in every panel.
 */
export function statementLabel(t: TFunction, row: { fiscal_date: string; fiscal?: FiscalTag | null }, annual: boolean): string {
  if (row.fiscal) return fiscalLabel(t, row.fiscal);
  const [y, m] = row.fiscal_date.split('-').map(Number);
  return fiscalLabel(t, { quarter: annual ? null : Math.ceil(m / 3), year: y });
}

/** "2026-06-24" → "Jun 24": a release date beside a period name. */
export function shortPeriodDate(iso: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(iso + 'T12:00:00Z'));
}

/** "2026-05-28" → "May 28, 2026": a period end, on hover. */
export function longPeriodDate(iso: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(iso + 'T12:00:00Z'));
}
