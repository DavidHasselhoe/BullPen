import { cn } from '@/lib/utils';
import type { SignalValue } from '@/lib/finance/health-score';

/**
 * MeterBar — "is this value good, and how big is it on a sensible scale?"
 *
 * A quiet horizontal meter. The fill takes a signal color (emerald/amber/red,
 * matching the HealthRing banding) only when a SignalValue is provided;
 * otherwise it stays neutral. Supports signed domains: when `min < 0` the
 * fill grows from the zero baseline, leftward for negative values.
 *
 * Pure + deterministic — safe anywhere. The numeric value must also be
 * rendered as text by the caller; this bar only adds spatial context.
 */

interface MeterBarProps {
  value: number;
  min: number;
  max: number;
  signal?: SignalValue;
  /** Reference tick, e.g. Beta 1.0 → { value: 1, label: 'market' }. */
  benchmark?: { value: number; label: string };
  /** Full-sentence label for screen readers. */
  srLabel: string;
  className?: string;
}

const FILL: Record<SignalValue, string> = {
  positive: 'bg-emerald-500',
  neutral: 'bg-amber-400',
  negative: 'bg-red-500',
};

function pos(v: number, min: number, max: number): number {
  return Math.max(0, Math.min(1, (v - min) / (max - min))) * 100;
}

export function MeterBar({ value, min, max, signal, benchmark, srLabel, className }: MeterBarProps) {
  const zero = min < 0 ? pos(0, min, max) : 0;
  const v = pos(value, min, max);
  const left = Math.min(zero, v);
  const width = Math.max(Math.abs(v - zero), 1);
  const fillCls = value < 0 ? 'bg-red-500' : signal ? FILL[signal] : 'bg-foreground/40';

  return (
    <div className={cn('w-full', className)} role="img" aria-label={srLabel}>
      <div className="relative h-1.5 w-full rounded-full bg-muted">
        <div
          className={cn('absolute top-0 h-full rounded-full', fillCls)}
          style={{ left: `${left}%`, width: `${width}%` }}
        />
        {min < 0 && (
          <div className="absolute top-[-2px] h-[10px] w-px bg-foreground/30" style={{ left: `${zero}%` }} />
        )}
        {benchmark && (
          <div
            className="absolute top-[-3px] h-3 w-px bg-foreground/50"
            style={{ left: `${pos(benchmark.value, min, max)}%` }}
          />
        )}
      </div>
      {benchmark && (
        <div className="relative mt-1 h-3.5">
          <span
            className="absolute -translate-x-1/2 text-xs leading-none text-muted-foreground/80"
            style={{ left: `${pos(benchmark.value, min, max)}%` }}
          >
            {benchmark.label}
          </span>
        </div>
      )}
    </div>
  );
}
