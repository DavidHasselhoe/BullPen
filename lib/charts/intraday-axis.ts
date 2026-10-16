/**
 * X-axis structure for the stock chart's intraday ranges: where each trading
 * day (5D) or session (1D) starts, as axis labels and faint divider rules.
 * The chart's x positions are index-based (see TimeSeriesChartShell), so an
 * index fraction is also a pixel fraction, which is what the spacing check uses.
 */

import { fmtClockTime, fmtTradingDate, type Clock } from '@/lib/dates/clock';

type Session = 'pre' | 'regular' | 'post';
interface Pt { time: number; session?: Session }

export interface AxisTick { date: Date; label: string }

const etDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
// Times are on the user's clock (lib/dates/clock), like the tooltip: the open
// reads 15:30 in Oslo and 9:30 AM in New York. Days (5D) stay the US trading
// day, which is the local date the session opens on everywhere east of Hawaii.

/** ET calendar day, "2026-10-16". */
export const etDayKey = (unixSeconds: number) => etDay.format(unixSeconds * 1000);

/**
 * The last `n` trading days. 5D is fetched as 7 calendar days, which starts
 * partway through a sixth session at the left edge.
 */
export function lastTradingDays<T extends Pt>(points: T[], n: number): T[] {
  const keys = points.map((p) => etDayKey(p.time));
  const keep = new Set([...new Set(keys)].slice(-n));
  return points.filter((_, i) => keep.has(keys[i]));
}

/** Drops a tick that would sit within `minGap` (fraction of the width) of the previous one. */
function spaced(indices: number[], n: number, minGap = 0.07): number[] {
  const out: number[] = [];
  for (const i of indices) {
    if (out.length && (i - out[out.length - 1]) / Math.max(n - 1, 1) < minGap) continue;
    out.push(i);
  }
  return out;
}

export function intradayAxis(points: Pt[], range: '1D' | '1W', clock: Clock): { ticks: AxisTick[]; dividers: Date[] } {
  const n = points.length;
  if (n < 2) return { ticks: [], dividers: [] };
  const at = (i: number) => new Date(points[i].time * 1000);
  const time = (i: number) => fmtClockTime(at(i), clock);

  if (range === '1W') {
    const starts: number[] = [];
    let prev = '';
    points.forEach((p, i) => {
      const key = etDayKey(p.time);
      if (key !== prev) starts.push(i);
      prev = key;
    });
    // The trading day, in the user's language: "Mon 12", "man. 12.".
    const label = (i: number) => `${fmtTradingDate(at(i), { weekday: 'short' }, clock)} ${fmtTradingDate(at(i), { day: 'numeric' }, clock)}`;
    return {
      ticks: spaced(starts, n).map((i) => ({ date: at(i), label: label(i) })),
      dividers: starts.slice(1).map(at),
    };
  }

  // 1D: a tick where each session starts (pre-market, the open, after hours).
  const starts = points.flatMap((p, i) => (p.session && p.session !== points[i - 1]?.session ? [i] : []));
  if (starts.length >= 2) {
    return {
      ticks: spaced(starts, n).map((i) => ({ date: at(i), label: time(i) })),
      dividers: starts.slice(1).map(at),
    };
  }
  // One session (extended hours hidden) or no sessions (crypto): evenly spaced times.
  const even = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(f * (n - 1)));
  return { ticks: even.map((i) => ({ date: at(i), label: time(i) })), dividers: [] };
}
