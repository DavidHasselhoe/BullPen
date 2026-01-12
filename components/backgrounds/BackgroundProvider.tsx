'use client';

import { useEffect } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { DarkVeil } from './DarkVeil';
import { Aurora } from './Aurora';
import { Particles } from './Particles';
import { Plasma } from './Plasma';
import { Beams } from './Beams';

export type BackgroundType = 'none' | 'dark-veil' | 'aurora' | 'particles' | 'plasma' | 'beams';

export function BackgroundProvider() {
  const { user } = useAuth();

  // Get background from user settings, default to 'none'
  const background: BackgroundType =
    ((user as any)?.settings as any)?.background || 'none';

  // Remove default background when animated background is active
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
