import { cn } from '@/lib/utils';

/**
 * FlowBar — "is more money flowing in or out?"
 *
 * One track split proportionally between an inflow (emerald) and an outflow
 * (red) side, each labeled with a direction glyph + amount so the meaning
 * never relies on color alone. Pure + deterministic.
 */

interface FlowBarProps {
  inflow: number;
  inLabel: string;
  outflow: number;
  outLabel: string;
  /** e.g. "Net −$14.7M" */
  netLabel?: string;
  srLabel: string;
  className?: string;
}

export function FlowBar({ inflow, inLabel, outflow, outLabel, netLabel, srLabel, className }: FlowBarProps) {
  const total = inflow + outflow;
  const inPct = total > 0 ? (inflow / total) * 100 : 50;

  return (
    <div className={cn('w-full', className)} role="img" aria-label={srLabel}>
      <div className="flex items-baseline justify-between gap-3 text-xs font-medium tabular-nums">
        <span className="text-emerald-500">▲ {inLabel}</span>
        <span className="text-red-500">▼ {outLabel}</span>
      </div>
      <div className="mt-1.5 flex h-2 w-full gap-[3px] overflow-hidden rounded-full">
        <div className="h-full rounded-full bg-emerald-500/80" style={{ width: `${Math.max(inPct, 1.5)}%` }} />
        <div className="h-full rounded-full bg-red-500/80" style={{ width: `${Math.max(100 - inPct, 1.5)}%` }} />
      </div>
      {netLabel && (
        <p className="mt-1.5 text-xs leading-none tabular-nums text-muted-foreground">{netLabel}</p>
      )}
    </div>
  );
}
