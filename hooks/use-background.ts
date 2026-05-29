'use client';

import { useAuth } from './use-auth';

export type BackgroundType =
  | 'none'
  | 'gradient-purple'
  | 'gradient-blue'
  | 'gradient-midnight'
  | 'gradient-embers';

const GRADIENT_VARIANTS: string[] = [
  'gradient-purple',
  'gradient-blue',
  'gradient-midnight',
  'gradient-embers',
];

export function useBackground() {
  const { user } = useAuth();
  const theme = ((user?.settings as Record<string, unknown>)?.theme as string | undefined) || 'dark';

  const background: BackgroundType = GRADIENT_VARIANTS.includes(theme)
    ? (theme as BackgroundType)
    : 'none';

  // True when a gradient is active — used by pages to omit bg-background on wrappers
  const hasAnimatedBackground = background !== 'none';

  return { background, hasAnimatedBackground };
}
