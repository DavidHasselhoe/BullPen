'use client';

/**
 * Donut allocation chart for a fund's top holdings, and the lead visual on the
 * fund detail page — the holdings bar list below it is the same data read a
 * second way, sharing one color per ticker via buildAllocation().
 *
 * Capped at ALLOCATION_TOP_N wedges plus one aggregated "Other", so a fund
 * with thousands of positions never renders an unreadable wheel of slivers.
 * "Other" is neutral gray rather than the next color in the ramp, since it
 * isn't a single holding competing for identity with the named ones.
 */

import { useEffect, useMemo, useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { Card, CardContent } from '@/components/ui/card';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import { ALLOCATION_OTHER_COLOR } from '@/lib/charts/allocation-colors';
import { allocationHeadline, quarterHeadline } from '@/lib/institutions/allocation';
import { fmtUsd } from '@/lib/institutions/format';
import type { Allocation } from '@/lib/institutions/allocation';
import type { HoldingsDiff } from '@/lib/institutions/compute-diff';

const OTHER_KEY = '__other__';

interface Slice {
  key: string;
  symbol: string | null;
  name: string;
  value: number;
  pct: number;
  color: string;
  isOther: boolean;
  // recharts' Pie `data` prop is typed as Record<string, unknown>[]
  [key: string]: unknown;
}

function toSlices(allocation: Allocation): Slice[] {
  const slices: Slice[] = allocation.top.map((h) => ({
    key: h.key,
    symbol: h.symbol,
    name: h.name,
    value: h.valueUsd,
    pct: h.pct,
    color: h.color,
    isOther: false,
  }));

  if (allocation.rest.length > 0) {
    slices.push({
      key: OTHER_KEY,
      symbol: null,
      name: `${allocation.rest.length.toLocaleString()} more position${allocation.rest.length === 1 ? '' : 's'}`,
      value: allocation.restValue,
      pct: allocation.restPct,
      color: ALLOCATION_OTHER_COLOR,
      isOther: true,
    });
  }

  return slices;
}

interface InstitutionalHoldingsPieChartProps {
  allocation: Allocation;
  totalValueUsd?: number | null;
  /** Prior-quarter comparison, when one exists. Null for the first quarter
   *  tracked for a fund, which falls the headline back to concentration. */
  diff?: HoldingsDiff | null;
  /** Share count per quarter, newest first, keyed by cusip — lets the headline
   *  say "for the third straight quarter" instead of only naming one move. */
  sharesHistory?: Record<string, number[]>;
  /** Ticker currently hovered anywhere on the page, so the donut and the bar
   *  list below highlight the same holding together. */
  highlightedKey: string | null;
  onHighlight: (key: string | null) => void;
  className?: string;
}

export function InstitutionalHoldingsPieChart({
  allocation,
  totalValueUsd,
  diff,
  sharesHistory,
  highlightedKey,
  onHighlight,
  className,
}: InstitutionalHoldingsPieChartProps) {
  const [reducedMotion, setReducedMotion] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = () => setReducedMotion(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // What the fund DID beats what it holds: a reader who already saw this
  // page last quarter learns nothing new from the concentration sentence.
  // Falls back to it when there is no prior quarter, or no move worth naming.
  // Memoized: `highlightedKey` (set on every row hover in a list that can run
  // to 7000+ rows) lives above this component, so without this it recomputed
  // on every mouse move over the holdings list.
  const headline = useMemo(
    () => quarterHeadline(diff ?? null, allocation, sharesHistory ?? {}) ?? allocationHeadline(allocation),
    [diff, allocation, sharesHistory]
  );

  if (allocation.top.length === 0) return null;

  const slices = toSlices(allocation);
  const centerValue = totalValueUsd ?? allocation.total;
  const topSlice = slices[0];
  const positionCount = allocation.top.length + allocation.rest.length;
  // The donut's hole is the readout. A floating tooltip would have to be
  // drawn somewhere, and inside a donut the only free space is the hole —
  // where it landed on top of the total and made both unreadable.
  const hovered = slices.find((s) => s.key === highlightedKey) ?? null;

  const ariaLabel = `Portfolio allocation. Largest holding: ${topSlice.symbol ?? topSlice.name} at ${topSlice.pct.toFixed(1)}% of the portfolio${
    slices.length > 1 ? `, plus ${slices.length - 1} more shown` : ''
  }. Full breakdown in the list below.`;

  return (
    <Card className={className}>
      <CardContent className="pt-6">
        {headline && (
          <p className="mb-6 max-w-prose text-base leading-snug text-foreground/90">{headline}</p>
        )}

        <div
          className="grid grid-cols-1 gap-8 sm:grid-cols-[280px_1fr] sm:items-center"
          role="img"
          aria-label={ariaLabel}
        >
          <div className="relative mx-auto h-[280px] w-[280px]" aria-hidden>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={slices}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={86}
                  outerRadius={126}
                  paddingAngle={2}
                  cornerRadius={4}
                  startAngle={90}
                  endAngle={-270}
                  stroke="var(--card)"
                  strokeWidth={2}
                  isAnimationActive={!reducedMotion}
                  animationDuration={450}
                  animationEasing="ease-out"
                >
                  {slices.map((s) => {
                    // Highlight wins over the "Other" mute, or hovering the
                    // Other wedge left it at the same flat 0.35 every dimmed
                    // wedge got, and nothing on the chart appeared to react.
                    const opacity =
                      highlightedKey === s.key ? 1 : highlightedKey ? 0.35 : s.isOther ? 0.45 : 1;
                    return (
                      <Cell
                        key={s.key}
                        fill={s.color}
                        fillOpacity={opacity}
                        onMouseEnter={() => onHighlight(s.key)}
                        onMouseLeave={() => onHighlight(null)}
                      />
                    );
                  })}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            {/* Three fixed lines in both states, so hovering across the donut
                swaps the numbers without the block growing and shrinking. */}
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-14 text-center">
              <span className="w-full truncate text-xs font-semibold tracking-wide text-muted-foreground/80">
                {hovered ? (hovered.symbol ?? 'Everything else') : 'Total 13F Value'}
              </span>
              <span className="mt-1 font-mono text-2xl font-semibold tabular-nums text-foreground">
                {fmtUsd(hovered ? hovered.value : centerValue)}
              </span>
              <span className="mt-0.5 font-mono text-xs tabular-nums text-muted-foreground/70">
                {hovered
                  ? `${hovered.pct.toFixed(1)}% of portfolio`
                  : `${positionCount.toLocaleString()} position${positionCount === 1 ? '' : 's'}`}
              </span>
            </div>
          </div>

          {/* Two columns on wide screens: one tall column leaves a ticker and
              its percentage separated by most of the card, which is a long way
              for the eye to travel to read one row. */}
          <div className="grid grid-cols-1 gap-x-8 gap-y-1.5 lg:grid-cols-2">
            {slices.map((s) => {
              const dimmed = highlightedKey !== null && highlightedKey !== s.key;
              // The wedge color rings the logo with no ring-offset: offset it
              // reads as a floating halo rather than as this holding's color,
              // which is the only job it has here.
              return (
                <div
                  key={s.key}
                  className="-mx-1.5 flex items-center gap-2.5 rounded-md px-1.5 py-1 transition-opacity duration-150"
                  style={{ opacity: dimmed ? 0.5 : 1 }}
                  onMouseEnter={() => onHighlight(s.key)}
                  onMouseLeave={() => onHighlight(null)}
                >
                  {s.symbol ? (
                    <div
                      className="shrink-0 rounded-full ring-2"
                      style={{ '--tw-ring-color': s.color } as React.CSSProperties}
                    >
                      <CompanyLogo ticker={s.symbol} name={s.name} size={22} />
                    </div>
                  ) : (
                    <span
                      className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                      style={{ backgroundColor: s.color }}
                    >
                      &hellip;
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground/85">
                    {s.symbol ?? s.name}
                  </span>
                  <span className="shrink-0 font-mono text-sm tabular-nums text-foreground">
                    {s.pct.toFixed(1)}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
