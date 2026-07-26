"use client";

import { useChartStable } from "./chart-context";

export interface EarningsMarkerProps {
  /** Report date to mark. */
  date: Date;
  /** Line/label color — typically green (beat), red (miss), or amber (unknown). */
  stroke?: string;
  strokeOpacity?: number;
}

/**
 * Vertical dashed line + small "E" label at an earnings report date.
 * `reference-line.tsx` (built for RSI/MACD) only draws horizontal
 * threshold lines — a different shape of primitive, since this is
 * semantically an event marker (line + label at a date), not a fixed
 * value line. Reads xScale directly rather than reusing ReferenceLine.
 */
export function EarningsMarker({
  date,
  stroke = "#f59e0b",
  strokeOpacity = 0.55,
}: EarningsMarkerProps) {
  const { xScale, innerHeight } = useChartStable();
  const x = xScale(date);

  if (x == null) return null;

  return (
    <g>
      <line
        stroke={stroke}
        strokeDasharray="3,4"
        strokeOpacity={strokeOpacity}
        strokeWidth={1.5}
        x1={x}
        x2={x}
        y1={0}
        y2={innerHeight}
      />
      <text fill={stroke} fontSize={8} opacity={strokeOpacity} x={x + 3} y={9}>
        E
      </text>
    </g>
  );
}

EarningsMarker.displayName = "EarningsMarker";

export default EarningsMarker;
