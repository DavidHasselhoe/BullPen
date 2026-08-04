/**
 * Symbols quoted on the public landing page.
 *
 * Shared by `/api/market/landing-quotes` (which fetches them in a single
 * TwelveData /batch call) and the landing components that render them, so the
 * two can't disagree about what's available.
 *
 * Cost note: this is one batched request for ALL anonymous landing traffic,
 * cached in Redis for 55s and at the CDN edge for 30s. At ~1 credit per symbol
 * that is roughly 15 credits/minute total regardless of visitor count — well
 * inside the per-minute budget, and the reason the ticker strip can show real
 * prices rather than the hardcoded ones it used to.
 */

/** Rendered in the hero's chart panel and floating cards. */
export const HERO_SYMBOLS = ['AAPL', 'NVDA', 'TSLA'] as const;

/**
 * The scrolling ticker tape under the hero. A tape reads as live market data to
 * anyone who has seen one before, so every entry here must resolve to a real
 * quote — the strip renders a shimmer for anything that hasn't loaded rather
 * than substituting a placeholder number.
 */
export const TAPE_SYMBOLS = [
  'AAPL',
  'NVDA',
  'TSLA',
  'MSFT',
  'GOOGL',
  'META',
  'AMZN',
  'AMD',
  'SPY',
  'QQQ',
  'BTC/USD',
  'ETH/USD',
] as const;

/** Everything the landing-quotes endpoint fetches, de-duplicated. */
export const LANDING_SYMBOLS: string[] = Array.from(
  new Set<string>([...HERO_SYMBOLS, ...TAPE_SYMBOLS]),
);
