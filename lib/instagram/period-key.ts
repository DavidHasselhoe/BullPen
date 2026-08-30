/**
 * ISO 8601 week key, e.g. "2026-W33" — the idempotency/lookup key shared by
 * a content type's generation cron and its publish cron. Both need the same
 * definition of "which week is this" so a post staged under one key is
 * reliably found under the same key when it's time to publish it.
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
 * The most recently completed Monday-Friday relative to `reference`. Shared
 * by instagram-earnings-results (generates Saturday, looking back at the
 * week that just ended) and instagram-earnings-results-publish (runs
 * Sunday, still targeting that same week) — both need to resolve to the
 * same period_key regardless of which of those two days they run on.
 * Designed to be triggered Saturday (daysSinceFriday=1) or Sunday
 * (daysSinceFriday=2), but stays correct for any manual trigger day — e.g.
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
