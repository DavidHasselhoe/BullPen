"use client";

import { useId } from "react";
import { chartCssVars, useChartStable } from "./chart-context";

export interface MarketClosedGap {
  /** Last real data point before the market closed. */
  start: Date;
  /** First real data point after the market reopened. */
  end: Date;
}

export interface MarketClosedBandsProps {
  /** Spans with no trading data — overnight closes, weekends, holidays. */
  gaps: MarketClosedGap[];
  /** Hatch line color. Default: var(--chart-foreground-muted) */
  stroke?: string;
  /** Hatch line opacity. Default: 0.35 */
  strokeOpacity?: number;
  yAxisId?: string | number;
}

/**
 * Subtle diagonal-hatch band over each real time gap in the data — the
 * overnight/weekend spans a session-aware price line already leaves blank
 * (see `SessionLine`'s per-region clipping). Renders as an underlay so the
 * price line and area fill stay fully legible on top; excluded from the
 * series reveal-clip like `Grid` since it's static chrome, not a series.
 */
export function MarketClosedBands({
  gaps,
  stroke = chartCssVars.foregroundMuted,
  strokeOpacity = 0.35,
  yAxisId,
}: MarketClosedBandsProps) {
  const { xScale, innerHeight } = useChartStable();
  // yAxisId accepted for API symmetry with other overlays; bands span the
  // full plot height regardless of which y-axis a series uses.
  void yAxisId;
  const reactId = useId().replace(/:/g, "");
  const patternId = `market-closed-hatch-${reactId}`;

  const bands = gaps
    .map((gap) => {
      const x1 = xScale(gap.start);
      const x2 = xScale(gap.end);
      if (x1 == null || x2 == null) {
        return null;
      }
      const x = Math.min(x1, x2);
      const width = Math.abs(x2 - x1);
      return width > 0.5 ? { x, width } : null;
    })
    .filter((band): band is { x: number; width: number } => band != null);

  if (bands.length === 0) {
    return null;
  }

  return (
    <>
      <defs>
        <pattern
          height={8}
          id={patternId}
          patternTransform="rotate(45)"
          patternUnits="userSpaceOnUse"
          width={8}
        >
          <line stroke={stroke} strokeOpacity={strokeOpacity} x1={0} x2={0} y1={0} y2={8} />
        </pattern>
      </defs>
      <g className="chart-market-closed-bands">
        {bands.map((band) => (
          <rect
            fill={`url(#${patternId})`}
            height={innerHeight}
            key={band.x}
            width={band.width}
            x={band.x}
            y={0}
          />
        ))}
      </g>
    </>
  );
}

MarketClosedBands.displayName = "MarketClosedBands";

export default MarketClosedBands;
