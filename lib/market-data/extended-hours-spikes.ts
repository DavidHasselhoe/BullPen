/**
 * TwelveData's extended-hours 5-minute bars carry stray prints: JPM's
 * after-hours line on 2026-10-01 read 333, 316, 315, 333, and on 10-02 a lone
 * 318 sat between two 332s. They come one or two bars at a time and report
 * zero volume (as every extended-hours bar does), so volume can't single them
 * out. On a sparkline a 4% one-bar drop at the close reads as a crash.
 *
 * A bar outside the regular session is dropped when its close is more than
 * MAX_GAP from the median of the SIDE bars before it AND of the SIDE bars after
 * it. A real after-hours move agrees with one side (the bars that follow it, or
 * for the last bar before it, the ones before), so it stays; a stray print
 * agrees with neither. Regular-session bars are never touched: their prints are
 * clean, and a real intraday crash must show. US listings only: the session
 * hours below are New York's, and a London or Oslo session read against them
 * would count as extended from open to close.
 */

const SIDE = 6;
const MAX_GAP = 0.02;

/** US session of a TwelveData ET datetime ("2024-04-29 09:35:00"). */
export function classifyTradingSession(datetime: string): 'pre' | 'regular' | 'post' {
  const hhmm = datetime.length >= 16 ? datetime.slice(11, 16) : '09:30';
  if (hhmm < '09:30') return 'pre';
  if (hhmm >= '16:00') return 'post';
  return 'regular';
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Indices of extended-hours bars to drop. `datetimes` and `closes` are
 * parallel, ascending; `exchangeTimezone` is the response's
 * meta.exchange_timezone, and anything but New York returns no drops.
 */
export function strayExtendedPrints(datetimes: string[], closes: number[], exchangeTimezone: string | undefined): Set<number> {
  const drop = new Set<number>();
  if (exchangeTimezone !== 'America/New_York') return drop;
  for (let i = 0; i < closes.length; i++) {
    if (classifyTradingSession(datetimes[i]) === 'regular') continue;
    // The newest bars stay until bars after them arrive: on a live chart the
    // last point may be the start of a real move (an earnings release).
    const after = closes.slice(i + 1, i + 1 + SIDE);
    if (after.length < 2) continue;
    const before = closes.slice(Math.max(0, i - SIDE), i);
    const sides = before.length >= 2 ? [before, after] : [after];
    const off = (side: number[]) => {
      const m = median(side);
      return m > 0 && Math.abs(closes[i] - m) / m > MAX_GAP;
    };
    if (sides.every(off)) drop.add(i);
  }
  return drop;
}
