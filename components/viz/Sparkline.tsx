'use client';

import { useId } from 'react';
import { cn } from '@/lib/utils';

/**
 * Sparkline — the one shared trend-at-a-glance strip.
 *
 * Pure SVG, deterministic. Consolidates the duplicate implementations that
 * used to live inline in WatchlistCard and TopMoversCard. Direction drives the
 * color through the semantic signal tokens (--gain / --loss / --neutral) so the
 * One Signal Rule lives in one place. When `direction` is omitted it's inferred
 * from first-vs-last, and callers should still pair a sparkline with a signed
 * figure or arrow elsewhere (never color alone).
 */

export type SparkDirection = 'up' | 'down' | 'neutral';

interface SparklineProps {
  /** The series to plot. < 2 points renders nothing (or a fallback arrow). */
  data: number[];
  /** Line/fill color. Inferred from first-vs-last when omitted. */
  direction?: SparkDirection;
  /** viewBox width. Default 100. */
  width?: number;
  /** viewBox height. Default 32. */
  height?: number;
  /** Fill a soft gradient under the line. Default false (line only). */
  area?: boolean;
  strokeWidth?: number;
  /** When there aren't enough points, draw a small up/down arrow instead of nothing. */
  fallbackArrow?: boolean;
  /** 'none' stretches the strip to the container width (ignoring aspect ratio). */
  preserveAspectRatio?: string;
  className?: string;
  /** Screen-reader description. Falls back to a generic trend label. */
  ariaLabel?: string;
}

const STROKE: Record<SparkDirection, string> = {
  up: 'var(--gain)',
  down: 'var(--loss)',
  neutral: 'var(--neutral)',
};

function inferDirection(data: number[]): SparkDirection {
  if (data.length < 2) return 'neutral';
  const delta = data[data.length - 1] - data[0];
  if (delta > 0) return 'up';
  if (delta < 0) return 'down';
  return 'neutral';
}

export function Sparkline({
  data,
  direction,
  width = 100,
  height = 32,
  area = false,
  strokeWidth = 1.5,
  fallbackArrow = false,
  preserveAspectRatio = 'none',
  className,
  ariaLabel,
}: SparklineProps) {
  const gradientId = useId();
  const dir = direction ?? inferDirection(data);
  const color = STROKE[dir];

  if (data.length < 2) {
    if (!fallbackArrow) return null;
    // Static direction hint when there's no series to draw.
    const up = dir !== 'down';
    const d = up ? 'M 2 12 L 6 8 L 10 10 L 14 4' : 'M 2 4 L 6 8 L 10 6 L 14 12';
    return (
      <svg
        viewBox="0 0 16 16"
        className={className}
        fill="none"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        role="img"
        aria-label={ariaLabel ?? (up ? 'Trending up' : 'Trending down')}
      >
        <path d={d} stroke={color} />
      </svg>
    );
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  // Leave a little vertical headroom so the peak isn't clipped by the stroke.
  const pad = strokeWidth;
  const usableH = height - pad * 2;

  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = pad + (1 - (v - min) / range) * usableH;
    return [x, y] as const;
  });

  const linePath = pts
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(2)},${p[1].toFixed(2)}`)
    .join(' ');
  const areaPath = `${linePath} L${width},${height} L0,${height} Z`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio={preserveAspectRatio}
      className={cn('overflow-visible', className)}
      role="img"
      aria-label={ariaLabel ?? `Recent trend, ${dir === 'up' ? 'up' : dir === 'down' ? 'down' : 'flat'}`}
    >
      {area && (
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.2} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
      )}
      {area && <path d={areaPath} fill={`url(#${gradientId})`} stroke="none" />}
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
