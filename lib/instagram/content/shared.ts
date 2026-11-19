/**
 * Shared house-style pieces every Instagram content-type generator reuses —
 * originally lived only in earnings-calendar.ts, extracted when
 * earnings-results.ts needed the exact same disclaimer/hashtags/week-label
 * formatting/logo resolution rather than a forked copy that could drift.
 * See docs/instagram-content-guide.md: "Apply this same prompt shape to
 * every future content-type generator."
 */

import { displayCompanyName } from '@/lib/market-data/company-name';

export const FIXED_DISCLAIMER = 'Not financial advice. Report dates gathered from public sources as of posting. Dates can change; always confirm before the market moves.';

/**
 * Static per content type, never model-written. Instagram caps a post at 5
 * hashtags and weighs how well tags match the caption over how many there
 * are, so each type gets 3-4 specific tags. The old shared set (#StockMarket
 * #Investing ...) went on every post, movers included, and huge generic tags
 * bury a small account. Reviewed 11-19 with David's brief.
 */
export const HASHTAGS = {
  earnings_results: '#earningsseason #earningsrecap #learnaboutstocks #stocksforbeginners',
  earnings_calendar: '#earningscalendar #earningsseason #stocksforbeginners',
  market_movers: '#stockmovers #stockmarketnews #learnaboutstocks',
  picks_scoreboard: '#stockpicks #sp500 #investingforbeginners',
} as const;

/** "#nvidiaearnings": the one tag people search for this exact report. */
export function deepDiveHashtags(companyName: string, ticker: string): string {
  const slug = displayCompanyName(companyName, ticker).toLowerCase().replace(/[^a-z0-9]/g, '');
  return `#${slug || ticker.toLowerCase()}earnings #earningsseason #learnaboutstocks #stocksforbeginners`;
}

/**
 * The shape every caption prompt asks for (David's 11-19 brief): the first
 * ~125 characters are all that show before "more", links in captions can't be
 * tapped, and saves, shares and replies are what Instagram rewards. Appended to
 * each generator's system prompt; the JSON "caption" field points at it.
 */
export const CAPTION_RULES = `CAPTION SHAPE (for the "caption" field):
- Line 1 is ONE sentence of at most 12 words that works on its own, because Instagram shows only about the first 125 characters before "more". Use the most surprising fact, a tension, or a question, built only from the given data. If it asks a question, the next sentences answer it. No greeting, and not just a ticker.
- Then a blank line, then one paragraph of 2 or 3 short sentences in plain language a beginner understands. Explain any money term in a few words the first time it appears (for example "profit per share, the profit for each share of stock"). Work the company and the topic in naturally, in words people search for, such as "NVIDIA's earnings" or "the biggest stock moves today".
- Then a blank line, then one closing line that invites a reply or a save: either a simple question the reader can answer from their own view (never whether to buy or sell anything), or a save prompt such as "Save this for the next earnings season." Never end with "see it on BullPen", "link in bio", or a link.
- Never write: "led the board", "the board", "took the biggest hit", "EPS", "beat estimates" without saying what was estimated, "bullish", "bearish", "to the moon". No hashtags and no emojis in the caption.`;

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

/**
 * Sibling to FIXED_DISCLAIMER, for content types built from BullPen's own
 * live price data rather than gathered report dates — market-movers.ts
 * doesn't touch anything Claude-sourced or third-party-report-date-based,
 * so FIXED_DISCLAIMER's "Report dates gathered from public sources" wording
 * doesn't apply.
 */
export const MARKET_DATA_DISCLAIMER = 'Not financial advice. Prices and % changes as of market close.';

/** Pre-market special-edition sibling — "as of market close" is factually
 *  wrong for a post built from live pre-market quotes (see
 *  generateMarketMoversContent's preMarket option). */
export const MARKET_DATA_DISCLAIMER_PRE_MARKET = 'Not financial advice. Prices and % changes are live pre-market quotes and can move sharply before the open.';

/** Single-date sibling to formatWeekLabel, e.g. "Aug 24, 2026". Same
 *  UTC-noon-anchor trick as formatDateHeader in slides.tsx, so a plain
 *  YYYY-MM-DD string never shifts a day under a server's local timezone. */
export function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

/**
 * One company, one tile: GOOG and GOOGL ("Alphabet Inc. Class C" / "Alphabet
 * Inc.") both showed on the Oct 26-30 2026 posts. Same short display name on
 * the same report date counts as one company; the bigger listing wins, in the
 * first one's place. Expects names and market caps already attached.
 */
export function dropShareClassTwins<T extends { symbol: string; name?: string; date: string; market_cap: number | null }>(items: T[]): T[] {
  const out: T[] = [];
  const at = new Map<string, number>();
  for (const item of items) {
    const key = `${item.date}|${displayCompanyName(item.name ?? item.symbol, item.symbol).toLowerCase()}`;
    const i = at.get(key);
    if (i == null) { at.set(key, out.length); out.push(item); }
    else if ((item.market_cap ?? 0) > (out[i].market_cap ?? 0)) out[i] = item;
  }
  return out;
}
