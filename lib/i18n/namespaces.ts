/**
 * i18next namespace registry — shared by client config (lib/i18n/config.ts),
 * server locale resolution (lib/i18n/server.ts), and the codemod/extraction
 * tooling in Phase 1. One list so route→namespace mapping can't drift between
 * client and server the way SUPPORTED_LANGUAGES used to (see supported-languages.ts).
 *
 * Namespaces beyond `common`/`settings`/`languages` are added as each area of
 * Phase 1 is converted — declaring one here before its locale files exist is
 * safe (i18next just gets an empty resource) but pointless until then.
 */

export const NAMESPACES = ['common', 'settings', 'languages', 'tools', 'stock', 'holdings', 'user', 'ai', 'discover', 'market', 'auth', 'academy', 'billing', 'watchlist', 'navigation', 'alerts'] as const;
export type Namespace = (typeof NAMESPACES)[number];

/**
 * Always loaded for every route, regardless of path — small enough that
 * bundling them beats a waterfall on first paint. Everything else lazy-loads
 * per the route→namespace mapping below as Phase 1 adds namespaces.
 *
 * `navigation` is the one exception to "namespaces lazy-load unless mapped
 * to a route prefix": Navigation.tsx/MobileTabBar.tsx render immediately on
 * every authenticated page load (via AuthNavigation, not behind a click like
 * settings/ai/market/auth), so lazy-loading it would reintroduce exactly the
 * flash-of-English Phase 0 was built to kill, just for the header/tab-bar
 * chrome instead of the whole page. Its catalog is small (~40 keys), so the
 * bundle-size cost of bundling it everywhere is negligible.
 */
export const ALWAYS_LOADED: readonly Namespace[] = ['common', 'languages', 'navigation'];

/**
 * Which extra namespace(s) a route's OWN page content needs preloaded on the
 * server, beyond ALWAYS_LOADED — so the page's own copy doesn't wait on a
 * client-side fetch after hydration. Checked as a path-prefix match; extended
 * as each Phase 1 area gets its own namespace (stock, holdings, tools, …).
 *
 * `settings` is deliberately NOT mapped to any path here even though it's the
 * one namespace with real content today: the Settings modal opens from a
 * header button present on every route, behind a user click rather than on
 * initial render. Preloading it on every route would defeat the point of
 * per-namespace code splitting for a namespace nobody may open this visit;
 * i18next-resources-to-backend fetches it lazily the moment the modal's
 * useTranslation('settings') hook first renders, which for a ~4KB file is
 * effectively instant.
 */
export function namespacesForPath(pathname: string): Namespace[] {
  if (pathname.startsWith('/tools')) return ['tools'];
  if (pathname.startsWith('/stock') || pathname.startsWith('/asset')) return ['stock'];
  if (pathname.startsWith('/holdings')) return ['holdings'];
  if (pathname.startsWith('/users')) return ['user'];
  if (pathname.startsWith('/discover') || pathname.startsWith('/dashboard')) return ['discover'];
  if (pathname.startsWith('/academy')) return ['academy'];
  if (pathname.startsWith('/upgrade') || pathname.startsWith('/pricing')) return ['billing'];
  if (pathname.startsWith('/watchlist')) return ['watchlist'];
  return [];
}
