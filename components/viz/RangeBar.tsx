import { cn } from '@/lib/utils';

/**
 * RangeBar — "where does the current value sit within a range?"
 *
 * Neutral by design: position within a 52-week range isn't inherently good
 * or bad, so no signal colors here — a quiet track with a foreground notch.
 * Pure + deterministic.
 */

interface RangeBarProps {
  low: number;
  high: number;
  /** Marker hidden when null/undefined (e.g. quote not loaded). */
  current?: number | null;
  format?: (v: number) => string;
  lowLabel?: string;
  highLabel?: string;
  srLabel: string;
  className?: string;
}

const defaultFormat = (v: number) => `$${v.toFixed(2)}`;

export function RangeBar({ low, high, current, format = defaultFormat, lowLabel, highLabel, srLabel, className }: RangeBarProps) {
  const hasMarker = current != null && high > low;
  // Clamp to 1.5–98.5% so the notch never overhangs the track's rounded ends
  const pct = hasMarker ? Math.max(1.5, Math.min(98.5, ((current - low) / (high - low)) * 100)) : 0;

  return (
    <div className={cn('w-full', className)} role="img" aria-label={srLabel}>
      <div className="relative h-1.5 w-full rounded-full bg-muted">
        {hasMarker && (
          <>
            <div className="absolute top-0 h-full rounded-full bg-foreground/25" style={{ left: 0, width: `${pct}%` }} />
            <div className="absolute top-[-3px] h-3 w-[3px] -translate-x-1/2 rounded-full bg-foreground" style={{ left: `${pct}%` }} />
          </>
        )}
      </div>
      <div className="mt-1.5 flex items-baseline justify-between text-xs leading-none tabular-nums text-muted-foreground">
        <span>{lowLabel ?? format(low)}</span>
        {hasMarker && <span className="font-medium text-foreground/80">{format(current)}</span>}
        <span>{highLabel ?? format(high)}</span>
      </div>
    </div>
  );
}
