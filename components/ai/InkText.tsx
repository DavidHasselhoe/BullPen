'use client';

import { Fragment, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { TickerPreview } from '@/components/company/TickerPreview';
import { isKnownTicker, useKnownTickers } from '@/components/company/TickerText';

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

/** A word carrying a cashtag, with whatever punctuation hugs it: "($ORCL)," */
const CASHTAG_WORD = /^(.*?)\$([A-Z]{1,5})\b(.*)$/;

/**
 * One word, with a company hover card if it is a `$TICKER` the catalogue
 * knows ("Oracle ($ORCL) reported..."), so a sympathy move names who moved it.
 */
function InkWord({ word, known }: { word: string; known: Set<string> | null }) {
  const m = word.match(CASHTAG_WORD);
  if (!m || !isKnownTicker(m[2], known)) return <>{word}</>;
  return (
    <>
      {m[1]}
      <TickerPreview
        ticker={m[2]}
        className="font-mono font-medium text-primary/85 hover:text-primary border-b border-primary/20 hover:border-primary/60 transition-colors"
      />
      {m[3]}
    </>
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
  const known = useKnownTickers();
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
              <span key={p} className="ink-word" style={{ ['--i' as string]: i++ }}><InkWord word={part} known={known} /></span>
            ),
          )}
        </span>
      ))}
    </span>
  );
}
