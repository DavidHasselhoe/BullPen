'use client';

import { useEffect } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { DarkVeil } from './DarkVeil';
import { Aurora } from './Aurora';
import { Particles } from './Particles';
import { Plasma } from './Plasma';
import { Beams } from './Beams';
import { StaticGradient } from './StaticGradient';

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

const STATIC_GRADIENT_VARIANTS = [
  'gradient-purple',
  'gradient-blue',
  'gradient-midnight',
  'gradient-embers',
] as const;

export function BackgroundProvider() {
  const { user } = useAuth();

  // Get theme from user settings (now combines theme + background)
  const theme = ((user as any)?.settings as any)?.theme || 'dark';

  // Extract background from theme
  const background: BackgroundType =
    theme === 'dark-veil' || theme === 'aurora' || theme === 'particles' || theme === 'plasma' || theme === 'beams'
      ? theme
      : theme === 'gradient-purple' || theme === 'gradient-blue' || theme === 'gradient-midnight' || theme === 'gradient-embers'
        ? theme
        : 'none';

  const isStaticGradient = STATIC_GRADIENT_VARIANTS.includes(background as (typeof STATIC_GRADIENT_VARIANTS)[number]);

  // Remove default background when any custom background is active
  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (background !== 'none') {
      document.documentElement.classList.add('animated-background-active');
      document.body.classList.add('animated-background-active');
    } else {
      document.documentElement.classList.remove('animated-background-active');
      document.body.classList.remove('animated-background-active');
    }

    return () => {
      document.documentElement.classList.remove('animated-background-active');
      document.body.classList.remove('animated-background-active');
    };
  }, [background]);

  if (isStaticGradient) {
    const variant = background.replace('gradient-', '') as 'purple' | 'blue' | 'midnight' | 'embers';
    return <StaticGradient variant={variant} />;
  }

  switch (background) {
    case 'dark-veil':
      return <DarkVeil />;
    case 'aurora':
      return <Aurora />;
    case 'particles':
      return <Particles />;
    case 'plasma':
      return <Plasma />;
    case 'beams':
      return <Beams />;
    default:
      return null;
  }
}
