'use client';

import { useChartStable } from './chart-context';
import { StaticSeriesPointMarker } from './series-point-marker';

export interface TransactionMarkerProps {
  /** Trade date to mark. */
  date: Date;
  /** Price to place the dot at (avg cost for a buy, sale price for a sell). */
  price: number;
  kind: 'buy' | 'sell';
  /** Native SVG tooltip text shown on hover. */
  title: string;
}

const BUY_COLOR = '#22c55e';
const SELL_COLOR = '#ef4444';

/**
 * A single buy/sell dot on the price line, at the trade's actual (date, price).
 * Unlike `EarningsMarker` (a full-height line — the report date matters more
 * than any one price), a trade is anchored to a specific price the user paid
 * or received, so this reads `yScale` too and clamps into the visible band
 * rather than spanning the chart.
 */
export function TransactionMarker({ date, price, kind, title }: TransactionMarkerProps) {
  const { xScale, yScale, innerHeight } = useChartStable();
  const x = xScale(date);
  if (x == null) return null;

  const y = Math.min(Math.max(yScale(price), 0), innerHeight);
  const color = kind === 'buy' ? BUY_COLOR : SELL_COLOR;

  return (
    <g>
      <title>{title}</title>
      <StaticSeriesPointMarker
        cx={x}
        cy={y}
        fill={color}
        strokeWidth={0}
        outlineWidth={1.5}
        outlineColor="var(--chart-background)"
        radius={4}
      />
    </g>
  );
}

TransactionMarker.displayName = 'TransactionMarker';

export default TransactionMarker;
