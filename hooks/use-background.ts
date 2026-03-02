'use client';

import { useAuth } from './use-auth';

export type BackgroundType =
  | 'none'
  | 'dark-veil'
  | 'aurora'
  | 'particles'
  | 'plasma'
  | 'beams'
  | 'gradient-purple'
  | 'gradient-blue'
  | 'gradient-midnight'
  | 'gradient-embers';

const ANIMATED_BACKGROUNDS = ['dark-veil', 'aurora', 'particles', 'plasma', 'beams'] as const;

export function useBackground() {
  const { user } = useAuth();

  const theme = ((user as any)?.settings as any)?.theme || 'dark';

  const background: BackgroundType =
    theme === 'dark-veil' || theme === 'aurora' || theme === 'particles' || theme === 'plasma' || theme === 'beams'
      ? theme
      : theme === 'gradient-purple' || theme === 'gradient-blue' || theme === 'gradient-midnight' || theme === 'gradient-embers'
        ? theme
        : 'none';

  const hasAnimatedBackground =
    background !== 'none' && ANIMATED_BACKGROUNDS.includes(background as (typeof ANIMATED_BACKGROUNDS)[number]);

  return {
    background,
    hasAnimatedBackground,
  };
}
