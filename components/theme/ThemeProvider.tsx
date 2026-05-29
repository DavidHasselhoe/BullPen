'use client';

import { useEffect } from 'react';
import { useAuth } from '@/hooks/use-auth';

/**
 * ThemeProvider
 * Applies the user's theme preference to the HTML element
 * Theme can be: 'dark', 'light', or a gradient name ('gradient-blue', etc.)
 * Gradient names imply dark mode
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  useEffect(() => {
    // Get theme from user settings, default to 'dark'
    const settings = user?.settings as Record<string, unknown>;
    const theme = (settings?.theme as string | undefined) || 'dark';

    // Apply theme to HTML element
    // Gradient names are dark mode
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
