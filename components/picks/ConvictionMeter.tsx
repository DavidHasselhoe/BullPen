'use client';

import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

const LABEL_KEYS: Record<number, string> = {
  1: 'pickConvictionSpeculative',
  2: 'pickConvictionTentative',
  3: 'pickConvictionModerate',
  4: 'pickConvictionStrong',
  5: 'pickConvictionHigh',
};

/**
 * Conviction 1–5, shown as filled pips plus the word.
 *
 * Deliberately neutral in colour: conviction is not a gain or a loss, and
 * DESIGN.md reserves emerald and red for financial direction only. Reading it
 * as "green means good" is exactly the misread to avoid — a high-conviction
 * pick can still lose.
 */
export function ConvictionMeter({ value, className }: { value: number; className?: string }) {
  const { t } = useTranslation('discover');
  const clamped = Math.max(1, Math.min(5, Math.round(value)));
  const label = t(LABEL_KEYS[clamped]);
  const outOf = t('pickConvictionOutOf', { value: clamped });

  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-md border border-border/40 bg-muted/30 px-2 py-1',
        className,
      )}
      title={`${label} (${outOf})`}
    >
      <span className="flex items-center gap-[3px]" aria-hidden>
        {Array.from({ length: 5 }, (_, i) => (
          <span
            key={i}
            className={cn(
              'h-1.5 w-1.5 rounded-full',
              i < clamped ? 'bg-foreground/70' : 'bg-foreground/15',
            )}
          />
        ))}
      </span>
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      <span className="sr-only">, {outOf}</span>
    </span>
  );
}
