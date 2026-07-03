import { type ReactNode } from 'react';

/**
 * HealthRing — BullPen's signature health-score mark.
 *
 * Five pillars (Profitability, Financial Strength, Valuation, Growth, Market
 * Risk) drawn as arcs around one central grade. Pass `pillars` for the full
 * five-arc mark (stock page); omit it for the compact single-arc badge used
 * where only the aggregate score is available (screener rows, watchlist).
 *
 * Pure + deterministic → safe to render on the server and in long lists.
 */

export interface HealthPillar {
  name: string;
  score: number;
  max: number;
  /** false = data unavailable → render the track only, no fill. */
  dataAvailable?: boolean;
}

export type HealthGrade = 'A' | 'B' | 'C' | 'D' | 'F';

interface HealthRingProps {
  /** Aggregate score 0–100. */
  score: number;
  grade: HealthGrade;
  /** Provide for the five-arc mark; omit for a single-arc overall badge. */
  pillars?: HealthPillar[];
  /** Pixel diameter. Default 88. */
  size?: number;
  /** Show the grade letter under the score. Defaults to size ≥ 60. */
  showGrade?: boolean;
  /** Show the "SCORE" eyebrow. Defaults to size ≥ 82. */
  showLabel?: boolean;
  className?: string;
}

const EMERALD = '#10b981';
const AMBER = '#fbbf24';
const RED = '#ef4444';
const TRACK = 'rgba(148, 163, 184, 0.18)';

const SEG = 72; // 360 / 5 pillars

function bandColor(ratio: number): string {
  if (ratio >= 0.7) return EMERALD;
  if (ratio >= 0.45) return AMBER;
  return RED;
}

function gradeColor(grade: HealthGrade): string {
  if (grade === 'A' || grade === 'B') return EMERALD;
  if (grade === 'C') return AMBER;
  return RED;
}

function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const a = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

function arcPath(cx: number, cy: number, r: number, start: number, end: number): string {
  const [x1, y1] = polar(cx, cy, r, start);
  const [x2, y2] = polar(cx, cy, r, end);
  const large = end - start > 180 ? 1 : 0;
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

export function HealthRing({
  score,
  grade,
  pillars,
  size = 88,
  showGrade,
  showLabel,
  className,
}: HealthRingProps) {
  const w = Math.max(3, Math.round(size * 0.075));
  const r = size / 2 - w / 2 - 1;
  const c = size / 2;
  const withGrade = showGrade ?? size >= 60;
  const withLabel = showLabel ?? size >= 82;

  const arcs: ReactNode[] = [];

  if (pillars && pillars.length > 0) {
    const gap = 7;
    pillars.slice(0, 5).forEach((p, i) => {
      const segStart = i * SEG + gap / 2;
      const segEnd = (i + 1) * SEG - gap / 2;
      const available = p.dataAvailable !== false;
      const ratio = p.max > 0 ? Math.max(0, Math.min(1, p.score / p.max)) : 0;
      const fillEnd = segStart + (segEnd - segStart) * ratio;
      arcs.push(
        <path key={`t${i}`} d={arcPath(c, c, r, segStart, segEnd)} fill="none" stroke={TRACK} strokeWidth={w} strokeLinecap="round" />
      );
      if (available && fillEnd - segStart > 0.5) {
        arcs.push(
          <path key={`f${i}`} d={arcPath(c, c, r, segStart, fillEnd)} fill="none" stroke={bandColor(ratio)} strokeWidth={w} strokeLinecap="round" />
        );
      }
    });
  } else {
    const gap = 10;
    const start = gap / 2;
    const end = 360 - gap / 2;
    const ratio = Math.max(0, Math.min(1, score / 100));
    const fillEnd = start + (end - start) * ratio;
    arcs.push(<path key="t" d={arcPath(c, c, r, start, end)} fill="none" stroke={TRACK} strokeWidth={w} strokeLinecap="round" />);
    if (fillEnd - start > 0.5) {
      arcs.push(<path key="f" d={arcPath(c, c, r, start, fillEnd)} fill="none" stroke={gradeColor(grade)} strokeWidth={w} strokeLinecap="round" />);
    }
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={className}
      role="img"
      aria-label={`BullPen health score ${score} out of 100, grade ${grade}`}
    >
      {arcs}
      {withLabel && (
        <text
          x={c}
          y={c - size * 0.27}
          textAnchor="middle"
          dominantBaseline="central"
          fill="currentColor"
          opacity="0.4"
          fontSize={size * 0.058}
          fontWeight={600}
          letterSpacing="0.14em"
        >
          SCORE
        </text>
      )}
      <text
        x={c}
        y={withGrade ? c - size * 0.045 : c}
        textAnchor="middle"
        dominantBaseline="central"
        fill="currentColor"
        fontSize={size * (withGrade ? 0.3 : 0.36)}
        fontWeight={700}
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {score}
      </text>
      {withGrade && (
        <text
          x={c}
          y={c + size * 0.17}
          textAnchor="middle"
          dominantBaseline="central"
          fill={gradeColor(grade)}
          fontSize={size * 0.135}
          fontWeight={600}
          letterSpacing="0.04em"
        >
          {grade}
        </text>
      )}
    </svg>
  );
}
