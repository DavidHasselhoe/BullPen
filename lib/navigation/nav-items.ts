import type { LucideIcon } from 'lucide-react';
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

export const NAV_ITEMS: NavItem[] = [
  { name: 'Home', href: '/dashboard', icon: Home },
  { name: 'Discover', href: '/discover', icon: Compass },
  { name: 'Academy', href: '/academy', icon: GraduationCap },
  { name: 'My Holdings', href: '/holdings', icon: Briefcase },
  { name: 'Watchlist', href: '/watchlist', icon: Bookmark },
];

export const COMMUNITY_LINKS: CommunityLink[] = [
  { id: 'feed', name: 'Feed', href: '/social', icon: Rss, description: 'Activity from investors you follow' },
  { id: 'members', name: 'Members', href: '/users', icon: Users, description: 'Browse investor profiles' },
];
