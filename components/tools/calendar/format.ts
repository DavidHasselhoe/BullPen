/**
 * Earnings-specific value formatters for the market calendar.
 *
 * The date helpers that used to live here moved to `lib/dates/calendar-format.ts`
 * when the holdings performance calendar needed the same UTC-safe math. Import
 * them from there.
 */

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
