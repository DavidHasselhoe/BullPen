/**
 * TrendBars — "which direction is this line item going?"
 *
 * A micro bar strip for N periods (oldest → newest), sized for table rows
 * and card corners. The most recent bar is emphasized; in `signed` mode
 * negative values hang below the baseline in red (paired with the caller's
 * −/text — never color alone). Pure SVG, no library.
 */

interface TrendBarsProps {
  /** Oldest → newest. Null values render as an empty slot. */
  values: (number | null)[];
  height?: number;
  /** Draw negatives below a zero baseline (red). */
  signed?: boolean;
  srLabel: string;
  className?: string;
}

const BAR_W = 6;
const GAP = 3;
const RED = '#ef4444';

export function TrendBars({ values, height = 28, signed = false, srLabel, className }: TrendBarsProps) {
  const width = values.length * (BAR_W + GAP) - GAP;
  const nums = values.filter((v): v is number => v != null && !isNaN(v));
  if (nums.length === 0) return null;

  const maxAbs = Math.max(...nums.map((v) => Math.abs(v)), 1e-9);
  const hasNeg = signed && nums.some((v) => v < 0);
  const baseline = hasNeg ? height / 2 : height;
  const scale = hasNeg ? height / 2 : height;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={srLabel}
      className={className}
    >
      {hasNeg && <line x1={0} y1={baseline} x2={width} y2={baseline} stroke="currentColor" opacity={0.2} strokeWidth={1} />}
      {values.map((v, i) => {
        if (v == null || isNaN(v)) return null;
        const h = Math.max((Math.abs(v) / maxAbs) * scale, 1.5);
        const x = i * (BAR_W + GAP);
        const isLast = i === values.length - 1;
        const neg = v < 0;
        return (
          <rect
            key={i}
            x={x}
            y={neg ? baseline : baseline - h}
            width={BAR_W}
            height={h}
            rx={1.5}
            fill={neg ? RED : 'currentColor'}
            opacity={neg ? (isLast ? 0.9 : 0.55) : isLast ? 0.85 : 0.35}
          />
        );
      })}
    </svg>
  );
}
