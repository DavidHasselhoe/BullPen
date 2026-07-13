'use client';

import { usePathname } from 'next/navigation';
import { Navigation } from './Navigation';
import { MobileTabBar } from './MobileTabBar';

// Auth pages and standalone marketing/legal pages — each has its own header
// (or none), and must never show the authenticated app nav, logged in or not.
const NO_APP_NAV_ROUTES = [
  '/',
  '/login',
  '/register',
  '/privacy',
  '/changelog',
  '/about',
  '/contact',
  '/roadmap',
  '/glossary',
  '/help',
  '/disclosures',
  '/security',
];

export function AuthNavigation() {
  const pathname = usePathname();

  if (NO_APP_NAV_ROUTES.includes(pathname)) {
    return null;
  }

  return (
    <>
      <Navigation />
      <MobileTabBar />
    </>
  );
}