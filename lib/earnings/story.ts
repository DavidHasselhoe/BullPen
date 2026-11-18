/**
 * The earnings story on the stock page: which report it tells, and the few
 * numbers it works out itself. Pure and client-safe; every input is stored
 * data (the Earnings card's history, the recap's figures, the price reaction).
 */

import type { EarningsCalendar } from '@/lib/finnhub/finnhub-client';
import type { ReleaseFigures } from '@/lib/ai/earnings-recap';
import { typicalSurprise } from '@/lib/instagram/content/deep-dive-story';

/** After this many days the story is old news and the Earnings card is the place to read it. */
export const STORY_DAYS = 7;
/** Days a recap's report date and the history row's date may differ by (a misdated feed). */
const SAME_REPORT_DAYS = 4;

const dayDiff = (a: string, b: string) => Math.round((Date.parse(a) - Date.parse(b)) / 86_400_000);

export interface StoryReport {
  report: EarningsCalendar & { epsActual: number; epsEstimate: number };
  /** Median EPS surprise (percent) over up to 4 earlier reports, or null with fewer than 3. */
  usualSurprise: number | null;
}

/**
 * The report a story tells: the one the recap was written for, if it is
 * recent and has both an estimate and an actual. Null means no story.
 */
export function storyReport(history: EarningsCalendar[] | undefined, recapReportDate: string | undefined, today: string): StoryReport | null {
  if (!history?.length || !recapReportDate) return null;
  const age = dayDiff(today, recapReportDate);
  if (age < 0 || age > STORY_DAYS) return null;
  const report = history.find((r) => Math.abs(dayDiff(r.date, recapReportDate)) <= SAME_REPORT_DAYS);
  if (report?.epsActual == null || report.epsEstimate == null) return null;
  const earlier = history
    .filter((r) => r.date < report.date && r.epsActual != null && r.epsEstimate != null && Math.abs(r.epsEstimate) >= 0.05 && !r.unconfirmed)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 4)
    .map((r) => ((r.epsActual! - r.epsEstimate!) / Math.abs(r.epsEstimate!)) * 100);
  return {
    report: report as StoryReport['report'],
    usualSurprise: earlier.length >= 3 ? typicalSurprise(earlier) : null,
  };
}

/** Percent change from a year ago, or null without both figures. */
export function revenueGrowth(f: ReleaseFigures | null | undefined): number | null {
  return f?.revenue && f.revenueYearAgo ? (f.revenue / f.revenueYearAgo - 1) * 100 : null;
}

/** The middle of next quarter's outlook, and how far it sits from this quarter's revenue (percent). */
export function outlook(f: ReleaseFigures | null | undefined): { mid: number; vsNow: number | null } | null {
  if (f?.guidanceLow == null || f.guidanceHigh == null) return null;
  const mid = (f.guidanceLow + f.guidanceHigh) / 2;
  return { mid, vsNow: f.revenue ? (mid / f.revenue - 1) * 100 : null };
}

/** The price slide's data, from /api/stock/[ticker]/earnings-reaction. */
export interface EarningsReaction {
  reportDate: string;
  /** Last price against the last regular close before the release. */
  changePercent: number;
  /** Unix seconds of the last trade counted. */
  asOf: number;
}
