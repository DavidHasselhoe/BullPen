'use client';

import { useEffect } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { isDarkTheme } from './theme-choice';

/**
 * ThemeProvider
 * Applies the theme ('dark' or 'light') to the HTML element.
 *
 * Light unless the account saved dark (isDarkTheme): guests and new accounts
 * arrive from the light landing page, and a jump to a black app read as a
 * different product. The root layout server-renders the same rule from the
 * signed-in profile, so neither side flashes the other theme before this runs.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  useEffect(() => {
    // Until auth resolves, keep what the server rendered.
    if (isLoading) return;
    document.documentElement.classList.toggle('dark', isDarkTheme(user?.settings));
  }, [user, isLoading]);

  return <>{children}</>;
}
