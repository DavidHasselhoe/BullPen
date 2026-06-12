'use client';

import { usePathname } from 'next/navigation';
import { Navigation } from './Navigation';
import { MobileTabBar } from './MobileTabBar';

export function AuthNavigation() {
  const pathname = usePathname();

  // Hide navigation on auth and marketing pages (the marketing landing has its own nav)
  if (pathname === '/login' || pathname === '/register' || pathname === '/') {
    return null;
  }

  return (
    <>
      <Navigation />
      <MobileTabBar />
    </>
  );
}