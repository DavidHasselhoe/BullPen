'use client';

import { useEffect } from 'react';
import { useAuth } from '@/hooks/use-auth';

/**
 * ThemeProvider
 * Applies the user's theme preference ('dark' or 'light') to the HTML element.
 * Any unrecognized legacy value (e.g. a removed gradient theme still saved on
 * an old user record) falls back to dark, same as a fresh/unset preference.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  useEffect(() => {
    // Get theme from user settings, default to 'dark'
    const settings = user?.settings as Record<string, unknown>;
    const theme = (settings?.theme as string | undefined) || 'dark';

    const html = document.documentElement;
    if (theme === 'light') {
      html.classList.remove('dark');
    } else {
      html.classList.add('dark');
    }
  }, [user]);

  return <>{children}</>;
}
