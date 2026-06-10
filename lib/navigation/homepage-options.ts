import type { LucideIcon } from 'lucide-react';
import { Home, Compass, GraduationCap, Briefcase, Bookmark, Wrench } from 'lucide-react';
import { TOOLS } from '@/lib/tools/tools-config';

/**
 * Canonical list of pages a user can pin as their default homepage. Shared by the
 * Settings picker and `HomepageRedirect` so the offered options and the redirect
 * whitelist can never drift apart.
 */
export interface HomepageOption {
  value: string; // route
  label: string;
  icon: LucideIcon;
}

/** Top-level destinations, mirroring the main nav. */
export const HOMEPAGE_PAGES: HomepageOption[] = [
  { value: '/dashboard', label: 'Home', icon: Home },
  { value: '/discover', label: 'Discover', icon: Compass },
  { value: '/academy', label: 'Academy', icon: GraduationCap },
  { value: '/holdings', label: 'My Holdings', icon: Briefcase },
  { value: '/watchlist', label: 'Watchlist', icon: Bookmark },
];

/** Tools shown in the "Tools" sub-dropdown — sourced from the nav's tools config. */
export const HOMEPAGE_TOOL_OPTIONS: HomepageOption[] = TOOLS
  .filter((t) => t.status !== 'coming-soon')
  .map((t) => ({ value: t.href, label: t.name, icon: t.icon }));

/** The "All tools" landing entry. */
export const ALL_TOOLS_OPTION: HomepageOption = { value: '/tools', label: 'All tools', icon: Wrench };

const STOCK_HOMEPAGE_RE = /^\/stock\/[A-Za-z0-9.-]{1,10}$/;

const LOOKUP: HomepageOption[] = [...HOMEPAGE_PAGES, ALL_TOOLS_OPTION, ...HOMEPAGE_TOOL_OPTIONS];
const STATIC_HOMEPAGES = new Set<string>(LOOKUP.map((o) => o.value));

export function isStockHomepage(path: string): boolean {
  return STOCK_HOMEPAGE_RE.test(path);
}

export function isAllowedDefaultHomepage(path: string): boolean {
  return STATIC_HOMEPAGES.has(path) || isStockHomepage(path);
}

/** Resolve a stored non-stock homepage value to its label + icon. */
export function findHomepageOption(value: string): HomepageOption | undefined {
  return LOOKUP.find((o) => o.value === value);
}
