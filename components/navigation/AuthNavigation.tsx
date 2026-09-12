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
  '/get-started',
  '/privacy',
  '/terms',
  '/cookies',
  '/accessibility',
  '/changelog',
  '/about',
  '/contact',
  '/roadmap',
  '/glossary',
  '/help',
  '/disclosures',
  '/security',
  // Dynamic, so it never had an exact path to list: one route per share.
  '/share',
];

/**
 * True for a standalone page and anything nested under one.
 *
 * The membership test used to be a bare `includes(pathname)`, an exact string
 * match, so it covered /glossary but not /glossary/free-cash-flow. Every
 * glossary term page therefore rendered the authenticated app nav stacked on
 * top of the marketing header the page draws for itself: two nav bars, with
 * the app one clipping its own links at 1280px. Those term pages are SEO entry
 * points, so the people most likely to hit it were strangers, which is exactly
 * what this list exists to prevent.
 *
 * '/' is matched exactly and never as a prefix, or it would swallow the app.
 */
function isStandalonePage(pathname: string): boolean {
  if (pathname === '/') return true;
  return NO_APP_NAV_ROUTES.some(
    (route) => route !== '/' && (pathname === route || pathname.startsWith(`${route}/`))
  );
}

export function AuthNavigation() {
  const pathname = usePathname();

  // Every route in the list is a standalone landing page that strangers can
  // reach, so none of them may leak the authenticated app's nav or
  // notifications, even when the viewer happens to be logged in.
  if (isStandalonePage(pathname)) {
    return null;
  }

  return (
    <>
      <Navigation />
      <MobileTabBar />
    </>
  );
}