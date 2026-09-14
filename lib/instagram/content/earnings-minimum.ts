/**
 * The minimum number of companies for a weekly earnings post, and the Discord
 * notice when a week falls short. Shared by earnings-calendar.ts (the week
 * ahead) and earnings-results.ts (the week just ended) so both hold the same
 * bar and say the same thing.
 *
 * A carousel naming one or two companies isn't a week of earnings, it's a thin
 * post: the calendar for the week of Sep 14, 2026 went out naming Lennar alone
 * as the season wound down. The generators check this before any caption or
 * logo work, so a skipped week costs as little as possible.
 */

import { attachCalendarMeta } from '@/lib/market-data/calendar-market-cap';
import { postToDiscord } from '@/lib/discord/post-message';

export const MIN_EARNINGS_COMPANIES = 3;

export interface TooFewCompanies {
  skipped: 'too_few_companies';
  /** Display names of the companies that did qualify, possibly none. */
  names: string[];
}

/**
 * Null when there are enough companies to post. Otherwise their names, from
 * BullPen's own cached data (no API credits), for the notice.
 */
export async function tooFewCompanies(companies: { symbol: string }[]): Promise<TooFewCompanies | null> {
  if (companies.length >= MIN_EARNINGS_COMPANIES) return null;
  const withMeta = await attachCalendarMeta<{ symbol: string; name?: string }>(
    companies.map((c) => ({ symbol: c.symbol }))
  );
  return { skipped: 'too_few_companies', names: withMeta.map((c) => c.name ?? c.symbol) };
}

export type EarningsPostKind = 'upcoming earnings' | 'earnings results';

/**
 * e.g. "Instagram post for upcoming earnings (week of Sep 14-18, 2026) was not
 * published: only 1 company (Lennar Corp.) is reporting earnings. Posts need at
 * least 3."
 */
export function tooFewCompaniesMessage(kind: EarningsPostKind, weekLabel: string, names: string[]): string {
  const upcoming = kind === 'upcoming earnings';
  const head = `Instagram post for ${kind} (week of ${weekLabel}) was not published`;
  if (names.length === 0) {
    return `${head}: no S&P 500, Nasdaq 100 or curated company ${upcoming ? 'is reporting earnings' : 'reported earnings with an estimate to compare against'}.`;
  }
  const count = names.length === 1 ? '1 company' : `${names.length} companies`;
  const verb = upcoming
    ? (names.length === 1 ? 'is reporting earnings' : 'are reporting earnings')
    : 'reported earnings with an estimate to compare against';
  return `${head}: only ${count} (${names.join(', ')}) ${verb}. Posts need at least ${MIN_EARNINGS_COMPANIES}.`;
}

/** Posts the skip notice to the Instagram Discord channel. Never throws. */
export async function postSkipNotice(message: string): Promise<void> {
  const webhookUrl = process.env.DISCORD_INSTAGRAM_WEBHOOK_URL;
  if (!webhookUrl) {
    console.warn('[instagram] DISCORD_INSTAGRAM_WEBHOOK_URL not set, skip notice not sent:', message);
    return;
  }
  await postToDiscord(webhookUrl, { content: `⏭️ ${message}` }).catch((err) =>
    console.error('[instagram] skip notice failed:', err)
  );
}
