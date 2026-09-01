/**
 * Named internal destinations for Bull's general-purpose `navigateTo` tool
 * (see lib/ai/tools.ts). Deliberately excludes anything the more specific
 * navigation tools already own (openCompanyPage, openComparison,
 * openScreener, openHoldings, openDiscover, openTools, openCompanyEarnings,
 * openCompanyNews, openDividendCalculator) — this registry only covers
 * plain destinations nothing else reaches yet.
 *
 * Also excludes anything that isn't a real navigable route: account
 * settings is a modal (components/user/SettingsModal.tsx), not a page, so
 * there's nowhere to router.push() to.
 *
 * Every path here is internal to BullPen — this is also the enforcement
 * point for "no external redirects": the tool can only ever resolve a path
 * from this fixed map, never an arbitrary URL the model invents.
 */

export interface AppDestination {
  /** Human-readable name used in the confirm prompt and system prompt docs. */
  label: string;
  path: string;
}

export const APP_DESTINATIONS = {
  discover: { label: 'the Discover page', path: '/discover' },
  academy: { label: 'Academy', path: '/academy' },
  academy_leaderboard: { label: 'the Academy leaderboard', path: '/academy/leaderboard' },
  watchlist: { label: 'your watchlist', path: '/watchlist' },
  alerts: { label: 'the Price Alerts tool', path: '/tools/alerts' },
  portfolio_builder: { label: 'the Portfolio Builder', path: '/tools/portfolio-builder' },
  calendar: { label: 'the Market Events Calendar', path: '/tools/calendar' },
  buy_here: { label: '"If You Bought Here"', path: '/tools/buy-here' },
  market_mood: { label: 'Market Mood', path: '/tools/market-mood' },
  heatmap: { label: 'the S&P 500 Heatmap', path: '/tools/heatmap' },
  social_feed: { label: 'the community feed', path: '/social' },
  browse_members: { label: 'Browse Members', path: '/users' },
  notifications: { label: 'your notifications', path: '/notifications' },
  upgrade: { label: 'the Upgrade page', path: '/upgrade' },
  weekly_pick: { label: "Bull's Weekly Pick", path: '/picks' },
} as const satisfies Record<string, AppDestination>;

export type AppDestinationId = keyof typeof APP_DESTINATIONS;

export const APP_DESTINATION_IDS = Object.keys(APP_DESTINATIONS) as AppDestinationId[];
