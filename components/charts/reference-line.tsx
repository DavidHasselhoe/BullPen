"use client";

import { useChartStable, useYScale } from "./chart-context";

export interface ReferenceLineProps {
  /** Y-value to draw the line at. */
  y: number;
  stroke?: string;
  strokeWidth?: number;
  strokeOpacity?: number;
  strokeDasharray?: string;
  yAxisId?: string | number;
}

/**
 * Plain horizontal threshold line at a fixed y-value (RSI's 30/50/70 bands,
 * MACD's 0 baseline). No `ReferenceArea`/`ReferenceLine` component was
 * installed from Bklit's registry — `reference-area-config.ts`/
 * `reference-area-geometry.ts` are extraction/geometry utilities for one
 * that was never added. This is a minimal standalone child component
 * (same architecture as `session-line.tsx`) rather than a full port of
 * whatever the real `ReferenceArea` component does, since a plain line is
 * all the oscillator panels need.
 */
export function ReferenceLine({
  y,
  stroke = "var(--chart-grid)",
  strokeWidth = 1,
  strokeOpacity = 1,
  strokeDasharray,
  yAxisId,
}: ReferenceLineProps) {
  const { innerWidth } = useChartStable();
  const yScale = useYScale(yAxisId);
  const yPixel = yScale(y);

  if (yPixel == null) return null;

  return (
    <line
      stroke={stroke}
      strokeDasharray={strokeDasharray}
      strokeOpacity={strokeOpacity}
      strokeWidth={strokeWidth}
      x1={0}
      x2={innerWidth}
      y1={yPixel}
      y2={yPixel}
    />
  );
}

ReferenceLine.displayName = "ReferenceLine";

export default ReferenceLine;
