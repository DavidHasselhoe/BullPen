'use client';

import { useEffect } from 'react';
import { useAuth } from '@/hooks/use-auth';

/**
 * ThemeProvider
 * Applies the theme ('dark' or 'light') to the HTML element.
 *
 * Guests get light: they arrive from the light landing page, and a jump to a
 * black app on their first click read as a different product. A signed-in
 * account gets its saved preference, dark when unset; any unrecognized legacy
 * value (e.g. a removed gradient theme on an old record) also falls back to
 * dark. The root layout server-renders the same split from the session cookie,
 * so neither side flashes the other theme before this runs.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  useEffect(() => {
    // Until auth resolves, keep what the server rendered.
    if (isLoading) return;
    const settings = user?.settings as Record<string, unknown> | undefined;
    const theme = user ? (settings?.theme as string | undefined) || 'dark' : 'light';

    const html = document.documentElement;
    if (theme === 'light') {
      html.classList.remove('dark');
    } else {
      html.classList.add('dark');
    }
  }, [user, isLoading]);

  return <>{children}</>;
}
