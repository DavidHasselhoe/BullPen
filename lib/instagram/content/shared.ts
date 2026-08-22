/**
 * Shared house-style pieces every Instagram content-type generator reuses —
 * originally lived only in earnings-calendar.ts, extracted when
 * earnings-results.ts needed the exact same disclaimer/hashtags/week-label
 * formatting/logo resolution rather than a forked copy that could drift.
 * See docs/instagram-content-guide.md: "Apply this same prompt shape to
 * every future content-type generator."
 */

export const FIXED_DISCLAIMER = 'Not financial advice. Report dates gathered from public sources as of posting. Dates can change; always confirm before the market moves.';

/**
 * Static, not model-generated — Instagram capped posts at 5 hashtags in
 * Dec 2025, and its 2026 algorithm weighs tag-caption relevance over count
 * (mismatched/generic tags now get suppressed rather than ignored), so a
 * small hand-picked set beats letting Claude invent a fresh batch every
 * week for near-zero benefit at real hallucination/drift risk. Mix is
 * deliberate: one broad reach tag (#investing), one broad-but-topical tag
 * (#stockmarket), one exact-moment tag (#earningsseason), and two
 * audience-specific tags matching BullPen's actual beginner-to-intermediate
 * positioning rather than generic finance-influencer tags (#wallstreet,
 * #financialfreedom, etc.) that would draw the wrong audience.
 */
export const FIXED_HASHTAGS = '#StockMarket #EarningsSeason #Investing #StocksToWatch #InvestingForBeginners';

export function formatWeekLabel(weekStart: string, weekEnd: string): string {
  const start = new Date(weekStart + 'T12:00:00Z');
  const end = new Date(weekEnd + 'T12:00:00Z');
  const startMonth = start.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
  const endMonth = end.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
  const year = end.toLocaleDateString('en-US', { year: 'numeric', timeZone: 'UTC' });
  const startDay = start.getUTCDate();
  const endDay = end.getUTCDate();
  return startMonth === endMonth
    ? `${startMonth} ${startDay}-${endDay}, ${year}`
    : `${startMonth} ${startDay} - ${endMonth} ${endDay}, ${year}`;
}

/**
 * Resolves one ticker's logo via the same self-healing proxy CompanyLogo
 * uses everywhere else in the app (/api/logo/[ticker] — cache lookup first,
 * then companies.logo_url, then a 1-credit TwelveData fetch on a true cold
 * miss). Resolved once here, at generation time, rather than left for the
 * render route to fetch — the renderer should only ever see a known-good
 * URL or null, never have to follow a redirect or handle a 404 itself.
 */
export async function resolveLogoUrl(appUrl: string, ticker: string): Promise<string | null> {
  try {
    const res = await fetch(`${appUrl}/api/logo/${encodeURIComponent(ticker)}`, { redirect: 'follow' });
    if (!res.ok) return null;
    return res.url;
  } catch {
    return null;
  }
}
