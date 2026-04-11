'use client';

/**
 * Lightweight static gradient backgrounds — pure CSS, zero GPU/CPU cost.
 * Use these when animated backgrounds cause lag.
 */

export type StaticGradientVariant =
  | 'purple'   // Similar to Aurora
  | 'blue'     // Cool blue tones
  | 'midnight' // Deep purple/black
  | 'embers';  // Warm amber/orange

const GRADIENTS: Record<StaticGradientVariant, string> = {
  purple:
    'radial-gradient(ellipse 80% 50% at 30% 20%, rgba(82, 39, 255, 0.4), transparent 70%), ' +
    'radial-gradient(ellipse 60% 40% at 70% 30%, rgba(124, 255, 103, 0.15), transparent 60%), ' +
    'linear-gradient(180deg, #0a0a0f 0%, #050508 100%)',
  blue:
    'radial-gradient(ellipse 70% 50% at 20% 25%, rgba(30, 64, 175, 0.35), transparent 65%), ' +
    'radial-gradient(ellipse 50% 35% at 80% 60%, rgba(59, 130, 246, 0.2), transparent 55%), ' +
    'linear-gradient(180deg, #0a0f1a 0%, #030508 100%)',
  midnight:
    'radial-gradient(ellipse 90% 60% at 50% 20%, rgba(49, 46, 129, 0.25), transparent 60%), ' +
    'linear-gradient(180deg, #0c0a14 0%, #030305 100%)',
  embers:
    'radial-gradient(ellipse 70% 50% at 40% 30%, rgba(194, 65, 12, 0.2), transparent 65%), ' +
    'radial-gradient(ellipse 50% 40% at 80% 70%, rgba(234, 88, 12, 0.15), transparent 55%), ' +
    'linear-gradient(180deg, #0f0a08 0%, #050303 100%)',
};

interface StaticGradientProps {
  variant?: StaticGradientVariant;
}

export function StaticGradient({ variant = 'purple' }: StaticGradientProps) {
  const style = { background: GRADIENTS[variant] };
  return (
    <div
      className="fixed inset-0 w-full h-full pointer-events-none"
      style={style}
      aria-hidden
    />
  );
}
