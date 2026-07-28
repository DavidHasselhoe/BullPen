import { cn } from '@/lib/utils';

/**
 * DeltaBar — "did they beat the estimate, and by how much?"
 *
 * An actual-value bar measured against an estimate tick, with a signed delta
 * chip (▲/▼ + number, never color alone). `actual == null` renders the
 * upcoming state: estimate tick only. Handles negative EPS via a zero-based
 * domain. Pure + deterministic.
 */

interface DeltaBarProps {
  estimate: number | null;
  actual: number | null;
  format?: (v: number) => string;
  srLabel: string;
  className?: string;
}

const defaultFormat = (v: number) => `$${v.toFixed(2)}`;

export function DeltaBar({ estimate, actual, format = defaultFormat, srLabel, className }: DeltaBarProps) {
  const values = [estimate, actual].filter((v): v is number => v != null);
  if (values.length === 0) return null;

  const domMin = Math.min(0, ...values);
  const domMax = Math.max(0, ...values) || 1;
  const span = domMax - domMin || 1;
  const pos = (v: number) => Math.max(0, Math.min(1, (v - domMin) / span)) * 100;

  const beat = actual != null && estimate != null ? actual >= estimate : null;
  const diff = actual != null && estimate != null ? actual - estimate : null;
  const diffPct = diff != null && estimate ? (diff / Math.abs(estimate)) * 100 : null;

  return (
    <div className={cn('flex items-center gap-3', className)} role="img" aria-label={srLabel}>
      <div className="relative h-1.5 w-24 shrink-0 rounded-full bg-muted">
        {actual != null && (
          <div
            className={cn(
              'absolute top-0 h-full rounded-full',
              beat == null ? 'bg-foreground/40' : beat ? 'bg-emerald-500' : 'bg-red-500'
            )}
            style={{ left: `${pos(Math.min(0, actual))}%`, width: `${Math.max(Math.abs(pos(actual) - pos(0)), 1.5)}%` }}
          />
        )}
        {estimate != null && (
          <div className="absolute top-[-3px] h-3 w-px bg-foreground/60" style={{ left: `${pos(estimate)}%` }} />
        )}
      </div>
      {beat != null && diff != null ? (
        <span
          className={cn(
            'text-xs font-medium tabular-nums leading-none',
            beat ? 'text-emerald-500' : 'text-red-500'
          )}
        >
          {beat ? '▲' : '▼'} {diff >= 0 ? '+' : '−'}{format(Math.abs(diff))}
          {diffPct != null && Math.abs(diffPct) < 1000 && (
            // 80%, not 70%: at 70% the inherited emerald-500/red-500 color measured
            // 4.07:1 against the card surface — under WCAG AA's 4.5:1 for text.
            <span className="opacity-80"> ({diffPct >= 0 ? '+' : '−'}{Math.abs(diffPct).toFixed(0)}%)</span>
          )}
        </span>
      ) : (
        <span className="text-xs text-muted-foreground leading-none">est. {estimate != null ? format(estimate) : '—'}</span>
      )}
    </div>
  );
}
