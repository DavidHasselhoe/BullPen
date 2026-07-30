/** Returns the ISO week range for a given offset. Uses UTC to avoid DST/timezone issues. */
export function getWeekRange(offsetWeeks = 0) {
  const now = new Date();
  const dow = now.getUTCDay(); // 0 = Sun
  const daysSinceMonday = dow === 0 ? 6 : dow - 1;
  const monday = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(),
    now.getUTCDate() - daysSinceMonday + offsetWeeks * 7,
  ));
  const sunday = new Date(Date.UTC(
    monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate() + 6,
  ));
  return {
    from: monday.toISOString().slice(0, 10),
    to: sunday.toISOString().slice(0, 10),
  };
}

export function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Formats a YYYY-MM-DD string as "Mon, May 26". Uses noon UTC to avoid timezone boundary issues. */
export function fmtDayHeader(d: string): string {
  const dt = new Date(d + 'T12:00:00Z');
  return dt.toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC',
  });
}

/** Formats a YYYY-MM-DD string as "May 26". */
export function fmtShortDate(d: string): string {
  const dt = new Date(d + 'T12:00:00Z');
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** Formats a week range as "May 25 – 31" or "May 26 – Jun 2". */
export function fmtWeekRange(from: string, to: string): string {
  const f = new Date(from + 'T12:00:00Z');
  const t = new Date(to + 'T12:00:00Z');
  const mf = f.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const mt = t.toLocaleDateString('en-US', {
    month: f.getUTCMonth() === t.getUTCMonth() ? undefined : 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
  return `${mf} – ${mt}`;
}

/** Every date string (YYYY-MM-DD) between `from` and `to`, inclusive. */
export function weekDatesBetween(from: string, to: string): string[] {
  const start = new Date(from + 'T12:00:00Z');
  const end = new Date(to + 'T12:00:00Z');
  const dates: string[] = [];
  for (const d = new Date(start); d.getTime() <= end.getTime(); d.setUTCDate(d.getUTCDate() + 1)) {
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

export function fmtEPS(n: number): string {
  const abs = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n < 0 ? `-$${abs}` : `$${abs}`;
}

export function fmtRevenue(n: number): string {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(1)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  return `$${n.toLocaleString('en-US')}`;
}
