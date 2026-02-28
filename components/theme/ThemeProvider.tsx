'use client';

import { useEffect } from 'react';
import { useAuth } from '@/hooks/use-auth';

/**
 * ThemeProvider
 * Applies the user's theme preference to the HTML element
 * Theme can be: 'dark', 'light', or a background name ('dark-veil', 'aurora', etc.)
 * Background names imply dark mode
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  useEffect(() => {
    // Get theme from user settings, default to 'dark'
    const settings = user?.settings as any;
    const theme = settings?.theme || 'dark';

    // Apply theme to HTML element
    // Background names (dark-veil, aurora, etc.) are dark mode
    const html = document.documentElement;
    if (theme === 'light') {
      html.classList.remove('dark');
    } else {
      // All other themes (dark, or any background) are dark mode
      html.classList.add('dark');
    }
  }, [user]);

  return <>{children}</>;
}
