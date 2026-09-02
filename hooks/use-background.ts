'use client';

export type BackgroundType = 'none';

/**
 * Gradient themes were removed (settings only offer dark/light now) — this
 * always resolves to 'none' so the ~20 pages reading `hasAnimatedBackground`
 * to decide whether to omit their own `bg-background` wrapper class keep
 * working unchanged, always taking their normal-background branch.
 */
export function useBackground() {
  return { background: 'none' as BackgroundType, hasAnimatedBackground: false };
}
