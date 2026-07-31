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
];

export function AuthNavigation() {
  const pathname = usePathname();

  // /share/[id] is dynamic (one per share, not a fixed path) — a prefix check
  // since it can't live in the exact-match list above. Same reasoning as every
  // other route here: a share link is a standalone landing page, viewed by
  // strangers, and must never leak the authenticated app's nav/notifications
  // even when the viewer (e.g. the sharer themselves) happens to be logged in.
  if (NO_APP_NAV_ROUTES.includes(pathname) || pathname.startsWith('/share/')) {
    return null;
  }

  return (
    <>
      <Navigation />
      <MobileTabBar />
    </>
  );
}