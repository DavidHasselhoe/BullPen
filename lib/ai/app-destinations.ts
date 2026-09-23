/**
 * Every page Bull can send someone to, and the only place it can get a path
 * from. This is the enforcement point for "no external redirects": navigateTo
 * resolves a path from this fixed map and can never emit a URL the model made
 * up.
 *
 * It used to cover only the destinations that had no dedicated tool, because
 * there were nine others (openCompanyPage, openHoldings, openDiscover,
 * openTools, openCompanyEarnings, openCompanyNews, openComparison...). Seven of
 * those were folded into navigateTo on 2026-09-22: each one cost ~300-600
 * tokens of schema on every single request, mostly a repeated description and a
 * repeated copy of the explicitUserRequest parameter, to express what is one
 * row in this table.
 *
 * Folding them in also removed a real trap. `openDiscover` opened /dashboard,
 * not /discover, and the system prompt carried a warning about exactly that
 * confusion. Now the two are separate rows with honest names.
 *
 * Still separate tools, deliberately: openScreener (fourteen filter
 * parameters) and openDividendCalculator (picks, amounts, and it navigates
 * immediately rather than asking). Merging those would mean one tool whose
 * parameters are a union of unrelated things, which is harder for the model to
 * use correctly than two clearly bounded ones.
 *
 * Also excludes anything that isn't a real navigable route: account settings is
 * a modal (components/user/SettingsModal.tsx), so there is nowhere to push to.
 */

export interface AppDestination {
  /** Human-readable name used in the confirm prompt. `{name}` is replaced with
   *  the resolved company name, `{tickers}` with the comma-joined list. */
  label: string;
  /** `{ticker}` and `{tickers}` are substituted; everything else is literal. */
  path: string;
  /** Requires a single ticker. The tool errors without one. */
  needsTicker?: true;
  /** Requires two or more tickers. */
  needsTickers?: true;
}

export const APP_DESTINATIONS = {
  // ── Fixed pages ──────────────────────────────────────────────────────────
  dashboard: { label: 'your dashboard', path: '/dashboard' },
  discover: { label: 'the Discover page', path: '/discover' },
  holdings: { label: 'your holdings', path: '/holdings' },
  tools_hub: { label: 'the tools hub', path: '/tools' },
  watchlist: { label: 'your watchlist', path: '/watchlist' },
  alerts: { label: 'the Price Alerts tool', path: '/tools/alerts' },
  academy: { label: 'Academy', path: '/academy' },
  academy_leaderboard: { label: 'the Academy leaderboard', path: '/academy/leaderboard' },
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

  // ── One company ──────────────────────────────────────────────────────────
  stock: { label: "{name}'s page", path: '/stock/{ticker}', needsTicker: true },
  stock_fullscreen: {
    label: "{name}'s page in fullscreen chart mode",
    path: '/stock/{ticker}?chart=fullscreen',
    needsTicker: true,
  },
  stock_earnings: { label: "{name}'s earnings calendar", path: '/stock/{ticker}#earnings', needsTicker: true },
  stock_news: { label: "{name}'s news", path: '/stock/{ticker}#news', needsTicker: true },
  deep_dive: { label: 'the AI Deep Dive on {name}', path: '/tools/deep-dive/{ticker}', needsTicker: true },

  // ── Several companies ────────────────────────────────────────────────────
  compare: { label: 'a comparison of {tickers}', path: '/tools/compare?tickers={tickers}', needsTickers: true },
} as const satisfies Record<string, AppDestination>;

export type AppDestinationId = keyof typeof APP_DESTINATIONS;

export const APP_DESTINATION_IDS = Object.keys(APP_DESTINATIONS) as AppDestinationId[];

/** Resolves a destination's path and label. Substitution only, no invention. */
export function resolveDestination(
  id: AppDestinationId,
  opts: { ticker?: string; tickers?: string[]; companyName?: string },
): { path: string; label: string } | { error: string } {
  const dest: AppDestination = APP_DESTINATIONS[id];

  if (dest.needsTicker) {
    const ticker = opts.ticker?.trim().toUpperCase();
    if (!ticker) return { error: `destination "${id}" requires a ticker.` };
    return {
      path: dest.path.replace('{ticker}', encodeURIComponent(ticker)),
      label: dest.label.replace('{name}', opts.companyName || ticker),
    };
  }

  if (dest.needsTickers) {
    // Capped at 5 to match what the comparison page renders.
    const list = (opts.tickers ?? []).slice(0, 5).map((t) => t.trim().toUpperCase()).filter(Boolean);
    if (list.length < 2) return { error: `destination "${id}" requires at least two tickers.` };
    return {
      path: dest.path.replace('{tickers}', encodeURIComponent(list.join(','))),
      label: dest.label.replace('{tickers}', list.join(', ')),
    };
  }

  return { path: dest.path, label: dest.label };
}
