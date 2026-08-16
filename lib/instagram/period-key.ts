/**
 * ISO 8601 week key, e.g. "2026-W33" — the idempotency/lookup key shared by
 * the generation cron (app/api/cron/instagram-earnings-weekly) and the
 * publish cron (app/api/cron/instagram-earnings-publish). Both need the same
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
