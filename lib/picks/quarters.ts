/**
 * Calendar quarters for Bull's Weekly Pick.
 *
 * A quarter is a cohort: the picks *made* in it. Their returns keep running
 * after the quarter ends, because a 12-month call judged on the week it was
 * made in is noise, not a result. Nothing here closes or resets a pick.
 */

export const QUARTER_RE = /^\d{4}-Q[1-4]$/;

/** 'YYYY-MM-DD' → '2026-Q3'. */
export function quarterOf(date: string): string {
  const year = date.slice(0, 4);
  const month = Number(date.slice(5, 7));
  return `${year}-Q${Math.ceil(month / 3)}`;
}

/** '2026-Q3' → { start: '2026-07-01', end: '2026-09-30' }, inclusive. */
export function quarterRange(quarter: string): { start: string; end: string } {
  const year = Number(quarter.slice(0, 4));
  const q = Number(quarter.slice(6));
  const startMonth = (q - 1) * 3 + 1;
  // Day 0 of the month after the quarter is the quarter's last day.
  const endDay = new Date(Date.UTC(year, startMonth + 2, 0)).getUTCDate();
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    start: `${year}-${pad(startMonth)}-01`,
    end: `${year}-${pad(startMonth + 2)}-${pad(endDay)}`,
  };
}

/** '2026-Q3' → 'Q3 2026'. */
export function quarterLabel(quarter: string): string {
  return `${quarter.slice(5)} ${quarter.slice(0, 4)}`;
}
