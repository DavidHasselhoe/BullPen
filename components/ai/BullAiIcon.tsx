import { cn } from '@/lib/utils';

const AI_ICON_SRC = {
  wave: '/illustrations/bull-ai-wave.png',
  think: '/illustrations/bull-ai-think.png',
  glass: '/illustrations/bull-ai-glass.png',
} as const;

export type BullAiPose = keyof typeof AI_ICON_SRC;

interface BullAiIconProps {
  pose: BullAiPose;
  size?: number;
  className?: string;
}

/**
 * Transparent-background black line art, same convention as EmptyState's
 * mascot poses — inverted to white in dark mode so it reads on the dark UI.
 * Pass `className` to override (e.g. the ink-swapped primary-fill button
 * needs the opposite: inverted in light mode, natural in dark mode).
 */
export function BullAiIcon({ pose, size = 24, className }: BullAiIconProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={AI_ICON_SRC[pose]}
      alt=""
      aria-hidden
      style={{ width: size, height: size }}
      className={cn('select-none shrink-0 dark:invert', className)}
    />
  );
}
