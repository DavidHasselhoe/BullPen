'use client';

import { useAuth } from './use-auth';

export type BackgroundType = 'none' | 'dark-veil' | 'aurora' | 'particles' | 'plasma' | 'beams';

export function useBackground() {
  const { user } = useAuth();

  const background: BackgroundType =
    ((user as any)?.settings as any)?.background || 'none';

  return {
    background,
    hasAnimatedBackground: background !== 'none'
  };
}
