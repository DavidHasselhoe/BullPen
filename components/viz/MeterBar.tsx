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
  /**
   * Formatted labels for the scale's two endpoints, e.g. "-10%" / "40%".
   * Without these the gray track has no visible scale, so a signed domain
   * (min < 0) reads as an unexplained gray region rather than "this is the
   * loss side of the scale." Omit only for a domain too obvious to need it.
   */
  minLabel?: string;
  maxLabel?: string;
}

const FILL: Record<SignalValue, string> = {
  positive: 'bg-emerald-500',
  neutral: 'bg-amber-400',
  negative: 'bg-red-500',
};

function pos(v: number, min: number, max: number): number {
  return Math.max(0, Math.min(1, (v - min) / (max - min))) * 100;
}

// Below this gap (in scale %), the zero and benchmark ticks sit close enough
// that both labels would overlap — drop "0" and keep the benchmark's, since
// "typical" is the more useful of the two at a glance.
const LABEL_COLLISION_THRESHOLD = 10;

export function MeterBar({ value, min, max, signal, benchmark, srLabel, className, minLabel, maxLabel }: MeterBarProps) {
  const zero = min < 0 ? pos(0, min, max) : 0;
  const v = pos(value, min, max);
  const left = Math.min(zero, v);
  const width = Math.max(Math.abs(v - zero), 1);
  const fillCls = value < 0 ? 'bg-red-500' : signal ? FILL[signal] : 'bg-foreground/40';

  const benchmarkPos = benchmark ? pos(benchmark.value, min, max) : null;
  const showZeroLabel = min < 0 && (benchmarkPos == null || Math.abs(benchmarkPos - zero) > LABEL_COLLISION_THRESHOLD);
  const showLabelRow = minLabel != null || maxLabel != null || showZeroLabel || benchmark != null;

  return (
    <div className={cn('w-full', className)} role="img" aria-label={srLabel}>
      <div className="relative h-1.5 w-full rounded-full bg-muted">
        <div
          className={cn('absolute top-0 h-full rounded-full', fillCls)}
          style={{ left: `${left}%`, width: `${width}%` }}
        />
        {/* Zero baseline — full bar height so the negative/positive split reads
            at a glance instead of the near-invisible hairline this replaced. */}
        {min < 0 && (
          <div className="absolute top-0 h-full w-px bg-foreground/45" style={{ left: `${zero}%` }} />
        )}
        {benchmark && (
          <div
            className="absolute top-[-3px] h-3 w-px bg-foreground/50"
            style={{ left: `${benchmarkPos}%` }}
          />
        )}
      </div>
      {showLabelRow && (
        <div className="relative mt-1 h-3.5 text-xs leading-none text-muted-foreground/70">
          {minLabel != null && <span className="absolute left-0">{minLabel}</span>}
          {maxLabel != null && <span className="absolute right-0">{maxLabel}</span>}
          {showZeroLabel && (
            <span className="absolute -translate-x-1/2 text-muted-foreground/60" style={{ left: `${zero}%` }}>
              0
            </span>
          )}
          {benchmark && (
            <span
              className="absolute -translate-x-1/2 text-muted-foreground/85"
              style={{ left: `${benchmarkPos}%` }}
            >
              {benchmark.label}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
