'use client';

import { useEffect } from 'react';
import { useAuth } from '@/hooks/use-auth';

export type BackgroundType =
  | 'none'
  | 'gradient-purple'
  | 'gradient-blue'
  | 'gradient-midnight'
  | 'gradient-embers';

// Applied directly to document.documentElement.style.background — no fixed div needed,
// which avoids all z-index stacking-context issues.
const GRADIENTS: Record<string, string> = {
  'gradient-purple':
    'radial-gradient(ellipse 80% 50% at 30% 20%, rgba(82, 39, 255, 0.4), transparent 70%), ' +
    'radial-gradient(ellipse 60% 40% at 70% 30%, rgba(124, 255, 103, 0.15), transparent 60%), ' +
    'linear-gradient(180deg, #0a0a0f 0%, #050508 100%)',
  'gradient-blue':
    'radial-gradient(ellipse 70% 50% at 20% 25%, rgba(30, 64, 175, 0.35), transparent 65%), ' +
    'radial-gradient(ellipse 50% 35% at 80% 60%, rgba(59, 130, 246, 0.2), transparent 55%), ' +
    'linear-gradient(180deg, #0a0f1a 0%, #030508 100%)',
  'gradient-midnight':
    'radial-gradient(ellipse 90% 60% at 50% 20%, rgba(49, 46, 129, 0.25), transparent 60%), ' +
    'linear-gradient(180deg, #0c0a14 0%, #030305 100%)',
  'gradient-embers':
    'radial-gradient(ellipse 70% 50% at 40% 30%, rgba(194, 65, 12, 0.2), transparent 65%), ' +
    'radial-gradient(ellipse 50% 40% at 80% 70%, rgba(234, 88, 12, 0.15), transparent 55%), ' +
    'linear-gradient(180deg, #0f0a08 0%, #050303 100%)',
};

const GRADIENT_VARIANTS = Object.keys(GRADIENTS);

export function BackgroundProvider() {
  const { user } = useAuth();
  const theme = ((user as any)?.settings as any)?.theme || 'dark';
  const isGradient = GRADIENT_VARIANTS.includes(theme);

  useEffect(() => {
    const html = document.documentElement;

    if (isGradient) {
      // Apply gradient directly to <html> — no z-index issues, always behind everything
      html.style.background = GRADIENTS[theme];
      html.classList.add('animated-background-active');
    } else {
      html.style.background = '';
      html.classList.remove('animated-background-active');
    }

    return () => {
      html.style.background = '';
      html.classList.remove('animated-background-active');
    };
  }, [theme, isGradient]);

  // No DOM elements needed — gradient is painted on <html> itself
  return null;
}
