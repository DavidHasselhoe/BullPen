'use client';

import { useEffect, memo, useMemo } from 'react';
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

// Memoized renderer — prevents Aurora/Particles/etc from re-rendering when
// useAuth fires (e.g. during init) but background value hasn't changed.
const BackgroundRenderer = memo(function BackgroundRenderer({
  background,
}: {
  background: BackgroundType;
}) {
  const isStaticGradient = STATIC_GRADIENT_VARIANTS.includes(
    background as (typeof STATIC_GRADIENT_VARIANTS)[number]
  );

  if (isStaticGradient) {
    const variant = background.replace('gradient-', '') as
      | 'purple'
      | 'blue'
      | 'midnight'
      | 'embers';
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
});

export function BackgroundProvider() {
  const { user } = useAuth();

  const theme = ((user as any)?.settings as any)?.theme || 'dark';

  const background: BackgroundType = useMemo(
    () =>
      theme === 'dark-veil' ||
      theme === 'aurora' ||
      theme === 'particles' ||
      theme === 'plasma' ||
      theme === 'beams'
        ? theme
        : theme === 'gradient-purple' ||
            theme === 'gradient-blue' ||
            theme === 'gradient-midnight' ||
            theme === 'gradient-embers'
          ? theme
          : 'none',
    [theme]
  );

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

  return <BackgroundRenderer background={background} />;
}
