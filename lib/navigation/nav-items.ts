import type { LucideIcon } from 'lucide-react';
import type { TFunction } from 'i18next';
import { Home, Compass, GraduationCap, Briefcase, Bookmark } from 'lucide-react';

/**
 * Single source of truth for the primary destinations, shared by the desktop
 * header nav ([Navigation.tsx]) and the mobile bottom tab bar ([MobileTabBar.tsx]).
 */
export interface NavItem {
  name: string;
  href: string;
  icon: LucideIcon;
}

/** The app's primary top-level navigation, translated like any other UI copy. */
export function getNavItems(t: TFunction): NavItem[] {
  return [
    { name: t('navHome'), href: '/dashboard', icon: Home },
    { name: t('navDiscover'), href: '/discover', icon: Compass },
    { name: t('navAcademy'), href: '/academy', icon: GraduationCap },
    { name: t('navMyHoldings'), href: '/holdings', icon: Briefcase },
    { name: t('navWatchlist'), href: '/watchlist', icon: Bookmark },
  ];
}
