'use client';

import { Fragment, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * How an AI explanation arrives: the space opens smoothly instead of the card
 * jumping, then the words settle in reading order, each sharpening out of a
 * soft blur like ink taking to paper. CSS only (`.ink-*` in globals.css); with
 * reduced motion everything is simply there.
 *
 * The text is in the DOM from the first frame, so screen readers and the
 * clamp measurement in ClampedText see it immediately; only its paint is
 * animated.
 */

/** Opens to its content's height on mount. Put spacing inside (pt-*), not on it, so the gap opens too. */
export function InkReveal({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('ink-reveal', className)}>
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}

/** The whole explanation settles in about this long, however many words it has. */
const SETTLE_MS = 1500;

/**
 * Bullets whose words ink in one after another across all of them. `stagger`
 * off is for streamed text: words arrive on their own schedule, so each just
 * settles as it lands (keys are positional, so earlier words never replay).
 */
export function InkBullets({
  bullets,
  stagger = true,
  className,
  bulletClassName,
}: {
  bullets: string[];
  stagger?: boolean;
  className?: string;
  bulletClassName?: (index: number) => string | undefined;
}) {
  const total = bullets.reduce((n, b) => n + b.split(/\s+/).filter(Boolean).length, 0);
  const step = stagger ? Math.min(40, Math.max(8, SETTLE_MS / Math.max(total, 1))) : 0;
  let i = 0;

  return (
    <span className={className} style={{ ['--ink-step' as string]: `${step}ms` }}>
      {bullets.map((bullet, b) => (
        <span key={b} className={cn('block', bulletClassName?.(b))}>
          {bullet.split(/(\s+)/).map((part, p) =>
            /^\s*$/.test(part) ? (
              <Fragment key={p}>{part}</Fragment>
            ) : (
              <span key={p} className="ink-word" style={{ ['--i' as string]: i++ }}>{part}</span>
            ),
          )}
        </span>
      ))}
    </span>
  );
}
