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
 * When a logged-in user visits / and has a default_homepage setting other than /,
 * redirects them to that page. Only runs on the root path.
 *
 * Logged-out users are NOT redirected — the dashboard is accessible to anyone,
 * and the marketing landing lives at /welcome (reached via the "Open Dashboard"
 * loop or marketing links).
 */
export function HomepageRedirect({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (pathname !== '/' || isLoading) return;
    if (!user) return;

    const defaultHomepage = (user.settings as Record<string, unknown> | null)?.default_homepage;
    if (!defaultHomepage || defaultHomepage === '/' || typeof defaultHomepage !== 'string') return;

    const target = defaultHomepage.startsWith('/') ? defaultHomepage : `/${defaultHomepage}`;
    if (!isAllowedDefaultHomepage(target)) return;

    router.replace(target);
  }, [pathname, isLoading, user, router]);

  return <>{children}</>;
}
