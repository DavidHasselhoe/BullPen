'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';

const VALID_HOMEPAGES = [
  '/',
  '/holdings',
  '/tools',
  '/tools/ai-chat',
  '/tools/screener',
  '/tools/compare',
  '/tools/filings',
  '/tools/buy-here',
];

const STOCK_HOMEPAGE_RE = /^\/stock\/[A-Za-z0-9.-]{1,10}$/;

function isAllowedDefaultHomepage(path: string): boolean {
  return VALID_HOMEPAGES.includes(path) || STOCK_HOMEPAGE_RE.test(path);
}

/**
 * Handles two redirects on the root path:
 *  - Logged-out visitors → /welcome (the marketing landing)
 *  - Logged-in users with a default_homepage setting → that page
 */
export function HomepageRedirect({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (pathname !== '/' || isLoading) return;

    // Logged-out → marketing landing
    if (!user) {
      router.replace('/welcome');
      return;
    }

    // Logged-in → honor default_homepage setting if set
    const defaultHomepage = (user.settings as Record<string, unknown> | null)?.default_homepage;
    if (!defaultHomepage || defaultHomepage === '/' || typeof defaultHomepage !== 'string') return;

    const target = defaultHomepage.startsWith('/') ? defaultHomepage : `/${defaultHomepage}`;
    if (!isAllowedDefaultHomepage(target)) return;

    router.replace(target);
  }, [pathname, isLoading, user, router]);

  return <>{children}</>;
}
