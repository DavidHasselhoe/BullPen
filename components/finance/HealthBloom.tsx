'use client';

import { forwardRef } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';
import type { CategoryScore } from '@/lib/finance/health-score';
import { bandColor, gradeColor, TRACK, type HealthGrade } from './health-colors';

/**
 * HealthBloom — portfolio-level counterpart to the per-stock HealthRing mark.
 * Same scoring/color logic (see health-colors.ts), rendered as a 5-petal
 * flower instead of a ring so the two are visually distinct at a glance.
 * Petal length is proportional to that category's score ratio; petal 0
 * (Profitability) points straight up, matching HealthRing's arc order.
 *
 * Stays Popover-free like HealthRing — hover/click are exposed as callback
 * props only. A consumer (PortfolioHealthCard) owns any drill-in UI, same
 * split as HealthScoreDrillIn wrapping the plain HealthRing.
 */

export interface HealthBloomProps {
  score: number;
  grade: HealthGrade;
  /** Exactly 5 categories, in HealthScore's fixed order. */
  categories: CategoryScore[];
  /** Pixel diameter. Default 180. */
  size?: number;
  className?: string;
  /** Category name currently hovered (via this bloom or a linked legend row). */
  hoveredCategory?: string | null;
  onCategoryHover?: (name: string | null) => void;
  onCategoryClick?: (name: string) => void;
}

const SEG = 72; // 360 / 5 petals, same constant HealthRing uses
const PETAL_DURATION = 0.55;
const PETAL_EASE = [0.85, 0, 0.15, 1] as const; // same curve as components/charts/animation.ts's DEFAULT_CHART_ENTER_TRANSITION
const HOVER_TRANSITION = { duration: 0.15, ease: 'easeOut' } as const;

export function HealthBloom({
  score,
  grade,
  categories,
  size = 180,
  className,
  hoveredCategory,
  onCategoryHover,
  onCategoryClick,
}: HealthBloomProps) {
  const reduceMotion = useReducedMotion();
  const c = size / 2;
  const maxLen = size * 0.42;
  const minLen = size * 0.14; // stub length at ratio 0, so a 0-score petal is still visible as a nub
  const petalWidth = size * 0.16;
  const centerRadius = size * 0.22; // matches the center circle's r — hit area must stop here, not overlap it
  const hitLen = maxLen - centerRadius;
  const interactive = !!(onCategoryHover || onCategoryClick);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={className}
      role="img"
      aria-label={`Portfolio health score ${score} out of 100, grade ${grade}`}
    >
      {categories.slice(0, 5).map((cat, i) => {
        const ratio = cat.max > 0 ? Math.max(0, Math.min(1, cat.score / cat.max)) : 0;
        const available = cat.dataAvailable !== false;
        const len = minLen + (maxLen - minLen) * ratio;
        const angle = i * SEG;
        const color = available ? bandColor(ratio) : TRACK;
        const isHovered = hoveredCategory === cat.name;

        return (
          <g
            key={cat.name}
            transform={`rotate(${angle} ${c} ${c})`}
            className={interactive ? 'cursor-pointer' : undefined}
            role={interactive ? 'button' : undefined}
            tabIndex={interactive ? 0 : undefined}
            aria-label={interactive ? `${cat.name}: ${cat.score} of ${cat.max}` : undefined}
            onMouseEnter={onCategoryHover ? () => onCategoryHover(cat.name) : undefined}
            onMouseLeave={onCategoryHover ? () => onCategoryHover(null) : undefined}
            onClick={onCategoryClick ? () => onCategoryClick(cat.name) : undefined}
            onKeyDown={
              onCategoryClick
                ? (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onCategoryClick(cat.name);
                    }
                  }
                : undefined
            }
          >
            {/* Full-reach invisible hit area — keeps a comfortable, consistent
                target even for a near-empty petal, without changing the
                visible (score-proportional) shape below. Stops at the center
                circle's edge rather than the shared center point, so it
                never sits under the (non-interactive but paint-order-on-top)
                circle badge and silently eat clicks there. */}
            {interactive && (
              <ellipse
                cx={c}
                cy={c - centerRadius - hitLen / 2}
                rx={Math.max(petalWidth, 22)}
                ry={hitLen / 2}
                fill="transparent"
                pointerEvents="all"
              />
            )}
            <motion.ellipse
              cx={c}
              cy={c - len / 2}
              rx={petalWidth / 2}
              ry={len / 2}
              fill={color}
              style={{ transformOrigin: `${c}px ${c}px` }}
              initial={reduceMotion ? false : { scaleY: 0, opacity: available ? 0.85 : 0.35 }}
              animate={{
                scaleY: 1,
                scale: isHovered ? 1.07 : 1,
                opacity: available ? (isHovered ? 1 : 0.85) : 0.35,
              }}
              transition={{
                scaleY: reduceMotion ? { duration: 0 } : { duration: PETAL_DURATION, ease: PETAL_EASE, delay: i * 0.06 },
                scale: HOVER_TRANSITION,
                opacity: HOVER_TRANSITION,
              }}
            />
          </g>
        );
      })}
      <circle cx={c} cy={c} r={size * 0.22} fill="var(--card)" stroke="var(--border)" strokeWidth={1} />
      <text
        x={c}
        y={c - size * 0.03}
        textAnchor="middle"
        dominantBaseline="central"
        fill="currentColor"
        fontSize={size * 0.16}
        fontWeight={700}
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {score}
      </text>
      <text
        x={c}
        y={c + size * 0.09}
        textAnchor="middle"
        dominantBaseline="central"
        fill={gradeColor(grade)}
        fontSize={size * 0.075}
        fontWeight={600}
        letterSpacing="0.04em"
      >
        {grade}
      </text>
    </svg>
  );
}

export interface HealthBloomLegendRowProps {
  category: CategoryScore;
  hovered?: boolean;
  onCategoryHover?: (name: string | null) => void;
  onClick?: () => void;
}

/**
 * A single legend row: dot + name + score on one line, a thin fill bar below
 * (matches HoldingsPieChart's Allocation-row pattern rather than leaving a
 * bare label-to-value gap). Forwards its ref so it can be used as a Radix
 * PopoverTrigger's `asChild` target for a per-category drill-in.
 */
export const HealthBloomLegendRow = forwardRef<HTMLButtonElement, HealthBloomLegendRowProps>(
  function HealthBloomLegendRow({ category: cat, hovered, onCategoryHover, onClick }, ref) {
    const ratio = cat.max > 0 ? cat.score / cat.max : 0;
    const available = cat.dataAvailable !== false;
    const pct = Math.max(0, Math.min(100, ratio * 100));
    const color = available ? bandColor(ratio) : TRACK;

    return (
      <button
        ref={ref}
        type="button"
        onMouseEnter={onCategoryHover ? () => onCategoryHover(cat.name) : undefined}
        onMouseLeave={onCategoryHover ? () => onCategoryHover(null) : undefined}
        onClick={onClick}
        className={cn(
          '-mx-1.5 w-full rounded-md px-1.5 py-1 text-left transition-colors',
          hovered ? 'bg-muted/60' : 'hover:bg-muted/30'
        )}
      >
        <div className="mb-1 flex items-center justify-between text-xs">
          <span className="flex items-center gap-1.5 text-foreground/85">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
            {cat.name}
          </span>
          <span className="tabular-nums font-semibold text-muted-foreground">
            {cat.score}
            <span className="font-medium text-muted-foreground/70">/{cat.max}</span>
          </span>
        </div>
        <div className="h-1 w-full overflow-hidden rounded-full bg-muted/60">
          {available && (
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${pct}%`, backgroundColor: color }}
            />
          )}
        </div>
      </button>
    );
  }
);

export function HealthBloomLegend({
  categories,
  hoveredCategory,
  onCategoryHover,
  onCategoryClick,
}: {
  categories: CategoryScore[];
  hoveredCategory?: string | null;
  onCategoryHover?: (name: string | null) => void;
  onCategoryClick?: (name: string) => void;
}) {
  return (
    <div className="space-y-1">
      {categories.map((cat) => (
        <HealthBloomLegendRow
          key={cat.name}
          category={cat}
          hovered={hoveredCategory === cat.name}
          onCategoryHover={onCategoryHover}
          onClick={onCategoryClick ? () => onCategoryClick(cat.name) : undefined}
        />
      ))}
    </div>
  );
}
