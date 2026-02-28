'use client';

import { useAuth } from './use-auth';

export type BackgroundType = 'none' | 'dark-veil' | 'aurora' | 'particles' | 'plasma' | 'beams';

export function useBackground() {
  const { user } = useAuth();

  // Get theme from user settings (now combines theme + background)
  const theme = ((user as any)?.settings as any)?.theme || 'dark';
  
  // Extract background from theme
  // Theme can be: 'dark', 'light', or a background name
  const background: BackgroundType = 
    (theme === 'dark-veil' || theme === 'aurora' || theme === 'particles' || theme === 'plasma' || theme === 'beams')
      ? theme
      : 'none';

  return {
    background,
    hasAnimatedBackground: background !== 'none'
  };
}
