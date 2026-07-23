import { cn } from '@/lib/utils';

/**
 * VolatilityGauge — "how volatile is this stock, and where do the market and
 * its industry sit on that same scale?"
 *
 * Unlike MeterBar (a growing fill that encodes good/bad), this is a static
 * calm→volatile gradient track with a ticker callout pinpointing the stock's
 * position, plus two independent benchmark ticks (market baseline, sector
 * median). Purpose-built for the Beta card — see StatisticsGrid.tsx.
 */

interface VolatilityGaugeProps {
  value: number;
  min: number;
  max: number;
  ticker: string;
  marketValue: number;
  marketLabel?: string;
  /** Sector-median beta. Its tick/label are omitted when unavailable. */
  industryValue?: number;
  industryLabel?: string;
  srLabel: string;
  className?: string;
}

function pos(v: number, min: number, max: number): number {
  return Math.max(0, Math.min(1, (v - min) / (max - min))) * 100;
}

// Text labels need more clearance than the thin tick lines so they don't clip against the card edge.
function clampLabel(pct: number): number {
  return Math.max(10, Math.min(90, pct));
}

export function VolatilityGauge({
  value,
  min,
  max,
  ticker,
  marketValue,
  marketLabel = 'Average market',
  industryValue,
  industryLabel = 'Industry',
  srLabel,
  className,
}: VolatilityGaugeProps) {
  const valuePct = pos(value, min, max);
  const marketPct = pos(marketValue, min, max);
  const industryPct = industryValue != null ? pos(industryValue, min, max) : null;

  return (
    <div className={cn('w-full', className)} role="img" aria-label={srLabel}>
      <div className="relative h-5">
        <div
          className="absolute -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-card px-1.5 py-0.5 text-xs font-semibold leading-none text-foreground"
          style={{ left: `${clampLabel(valuePct)}%` }}
        >
          {ticker}
        </div>
      </div>

      <div className="relative h-2 w-full rounded-full bg-gradient-to-r from-emerald-500 via-amber-400 to-red-500">
        <div
          className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-foreground"
          style={{ left: `${valuePct}%` }}
        />
      </div>

      <div className="mt-1 flex justify-between text-xs leading-none text-muted-foreground/70">
        <span>Low</span>
        <span>High</span>
      </div>

      <div className="relative mt-2 h-3">
        <div className="absolute top-0 h-3 w-px bg-foreground/30" style={{ left: `${marketPct}%` }} />
        {industryPct != null && (
          <div className="absolute top-0 h-3 w-px bg-foreground/30" style={{ left: `${industryPct}%` }} />
        )}
      </div>
      {industryPct != null && (
        <div className="relative h-4">
          <span
            className="absolute -translate-x-1/2 whitespace-nowrap rounded bg-muted px-1 py-0.5 text-xs font-medium leading-none text-muted-foreground"
            style={{ left: `${clampLabel(industryPct)}%` }}
          >
            {industryLabel}
          </span>
        </div>
      )}
      <div className="relative mt-1 h-3.5">
        <span
          className="absolute -translate-x-1/2 whitespace-nowrap text-xs leading-none text-muted-foreground/60"
          style={{ left: `${clampLabel(marketPct)}%` }}
        >
          {marketLabel}
        </span>
      </div>
    </div>
  );
}
