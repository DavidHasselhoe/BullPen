'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { cn } from '@/lib/utils';
import {
  TIMEFRAMES,
  type SectorPerformance as SectorPerf,
  type Timeframe,
} from '@/lib/discover/discover-config';
import { SectorRow } from './SectorRow';

function getTimeframeLabels(t: TFunction): Record<Timeframe, string> {
  return {
    '1D': t('timeframeToday'),
    '1W': t('timeframeWeek'),
    '1M': t('timeframeMonth'),
    YTD: t('timeframeYtd'),
  };
}

interface Props {
  sectors: Record<Timeframe, SectorPerf[]>;
}

/**
 * Where money moved, in one chart.
 *
 * This replaces eleven auto-scrolling rails of company logos. A row of logos
 * told a reader nothing they didn't already know — that NVDA is a big tech
 * company — whereas the ordering here is the actual information: which corners
 * of the market are leading and lagging, and by how much. The companies are
 * still one click away, but they load on demand instead of mounting 132 cards
 * nobody asked for.
 *
 * Each sector is priced by its SPDR sector ETF, so the number is a real
 * tradeable return rather than an average of whichever names we happened to list.
 */
export function SectorPerformance({ sectors }: Props) {
  const { t } = useTranslation('discover');
  const TIMEFRAME_LABELS = getTimeframeLabels(t);
  const [timeframe, setTimeframe] = useState<Timeframe>('1D');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [grown, setGrown] = useState(false);

  // Memoized so the `?? []` fallback doesn't mint a new array identity on every
  // render and invalidate the scale memo below with it.
  const rows = useMemo(() => sectors[timeframe] ?? [], [sectors, timeframe]);

  // Bars scale to the largest absolute move on screen, so a quiet day still
  // reads as a shape rather than eleven invisible slivers.
  const scale = useMemo(() => {
    const max = Math.max(...rows.map((r) => Math.abs(r.changePct ?? 0)), 0);
    return max > 0 ? max : 1;
  }, [rows]);

  // Grow the bars out of the zero line once, after first paint. Motion here is
  // meaningful — it encodes magnitude, which is the one thing the chart is for.
  // The global prefers-reduced-motion rule collapses the transition to ~0ms, so
  // reduced-motion users get the final state immediately.
  useEffect(() => {
    const raf = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  if (rows.length === 0) return null;

  const leader = rows[0];
  const laggard = rows[rows.length - 1];

  return (
    <section aria-labelledby="sectors-heading" className="mb-10">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2
            id="sectors-heading"
            className="text-sm font-semibold uppercase tracking-widest text-muted-foreground/80"
          >
            {t('sectorPerfHeading')}
          </h2>
          {leader?.changePct != null && laggard?.changePct != null && (
            <p className="mt-1 text-xs text-muted-foreground/80">
              {t('sectorPerfLeaderLaggard', { leader: leader.label, laggard: laggard.label, timeframe: TIMEFRAME_LABELS[timeframe].toLowerCase() })}
            </p>
          )}
        </div>

        <div
          role="tablist"
          aria-label={t('sectorPerfTimeframeAriaLabel')}
          className="flex shrink-0 items-center gap-0.5 rounded-md bg-muted/50 p-0.5"
        >
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              type="button"
              role="tab"
              aria-selected={tf === timeframe}
              onClick={() => setTimeframe(tf)}
              className={cn(
                'rounded px-2.5 py-1 text-[11px] font-medium tabular-nums transition-colors duration-150',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-background',
                tf === timeframe
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border/50 bg-card/40">
        <ul>
          {rows.map((sector, i) => (
            <SectorRow
              key={sector.key}
              sector={sector}
              scale={scale}
              index={i}
              grown={grown}
              expanded={expanded === sector.key}
              // Accordion rather than multi-open: the page is trying to stop
              // being a wall of cards, and eleven open sectors is that wall.
              onToggle={() => setExpanded((cur) => (cur === sector.key ? null : sector.key))}
            />
          ))}
        </ul>
      </div>

      <p className="mt-2 text-[11px] text-muted-foreground/80">
        {t('sectorPerfFooterNote')}
      </p>
    </section>
  );
}
