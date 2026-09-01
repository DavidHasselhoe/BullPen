/**
 * ISO 8601 week key, e.g. "2026-W33" — the idempotency/lookup key for a
 * content type's generation cron, so a re-run for the same week finds the
 * row it already staged instead of duplicating it.
 */
export function isoWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7; // Sunday (0) -> 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum); // Thursday of the same ISO week
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil((((d.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

/**
 * The most recently completed Monday-Friday relative to `reference` —
 * used by instagram-earnings-results, which generates Saturday looking back
 * at the week that just ended. Designed to be triggered Saturday
 * (daysSinceFriday=1), but stays correct for any manual trigger day — e.g.
 * triggered on Friday itself (daysSinceFriday=0) targets that same week,
 * triggered on Monday (daysSinceFriday=3) targets the week that just ended.
 * Mirror image of nextTradingWeek, which jumps forward instead of back.
 */
export function lastTradingWeek(reference: Date): { weekStart: string; weekEnd: string } {
  const dow = reference.getDay(); // 0=Sun..6=Sat
  const daysSinceFriday = (dow - 5 + 7) % 7;
  const friday = new Date(reference);
  friday.setDate(reference.getDate() - daysSinceFriday);
  const monday = new Date(friday);
  monday.setDate(friday.getDate() - 4);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { weekStart: fmt(monday), weekEnd: fmt(friday) };
}
