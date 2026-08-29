import type { LucideIcon } from 'lucide-react';
import type { TFunction } from 'i18next';
import { Home, Compass, GraduationCap, Briefcase, Bookmark, Rss, Users } from 'lucide-react';

/**
 * Single source of truth for the primary destinations, shared by the desktop
 * header nav ([Navigation.tsx]) and the mobile bottom tab bar ([MobileTabBar.tsx]).
 */
export interface NavItem {
  name: string;
  href: string;
  icon: LucideIcon;
}

export interface CommunityLink {
  id: string;
  name: string;
  href: string;
  icon: LucideIcon;
  description: string;
}

/**
 * NAV_ITEMS is the app's primary top-level navigation, visible in the header
 * chrome on every page, so it gets real translation like any other UI copy —
 * unlike COMMUNITY_LINKS below, which stays untranslated data (same
 * secondary-dropdown-listing treatment as TOOLS in lib/tools/tools-config.ts).
 */
export function getNavItems(t: TFunction): NavItem[] {
  return [
    { name: t('navHome'), href: '/dashboard', icon: Home },
    { name: t('navDiscover'), href: '/discover', icon: Compass },
    { name: t('navAcademy'), href: '/academy', icon: GraduationCap },
    { name: t('navMyHoldings'), href: '/holdings', icon: Briefcase },
    { name: t('navWatchlist'), href: '/watchlist', icon: Bookmark },
  ];
}

export const COMMUNITY_LINKS: CommunityLink[] = [
  { id: 'feed', name: 'Feed', href: '/social', icon: Rss, description: 'Activity from investors you follow' },
  { id: 'members', name: 'Members', href: '/users', icon: Users, description: 'Browse investor profiles' },
];
