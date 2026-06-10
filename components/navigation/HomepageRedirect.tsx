'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { isAllowedDefaultHomepage } from '@/lib/navigation/homepage-options';

/**
 * When a logged-in user lands on /dashboard and has a default_homepage setting
 * other than /dashboard, redirects them to that page. Only runs on /dashboard.
 *
 * `/` is the marketing landing (LandingClient handles redirecting authed users
 * to /dashboard itself), so this redirect does not run there.
 */
export function HomepageRedirect({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (pathname !== '/dashboard' || isLoading) return;
    if (!user) return;

    const defaultHomepage = (user.settings as Record<string, unknown> | null)?.default_homepage;
    if (!defaultHomepage || defaultHomepage === '/dashboard' || typeof defaultHomepage !== 'string') return;

    const target = defaultHomepage.startsWith('/') ? defaultHomepage : `/${defaultHomepage}`;
    if (!isAllowedDefaultHomepage(target)) return;

    router.replace(target);
  }, [pathname, isLoading, user, router]);

  return <>{children}</>;
}
