'use client';

import { usePathname } from 'next/navigation';
import { Navigation } from './Navigation';

export function AuthNavigation() {
  const pathname = usePathname();
  
  // Hide navigation on auth pages
  if (pathname === '/login' || pathname === '/register') {
    return null;
  }

  return <Navigation />;
}