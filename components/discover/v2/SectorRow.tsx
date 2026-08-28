'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SECTOR_BY_KEY, type SectorPerformance, type TickerItem } from '@/lib/discover/discover-config';
import { TickerCard } from './TickerCard';

interface Props {
  sector: SectorPerformance;
  /** Largest absolute move across the visible rows — the bar scale. */
  scale: number;
  expanded: boolean;
  onToggle: () => void;
  /** Row index, used to stagger the bar-growth animation down the chart. */
  index: number;
  /** False until after first paint, so bars animate out from zero. */
  grown: boolean;
}

function fmtPct(pct: number | null): string {
  if (pct == null) return '—';
  const sign = pct > 0 ? '+' : pct < 0 ? '−' : '';
  return `${sign}${Math.abs(pct).toFixed(2)}%`;
}

/**
 * One sector: a diverging bar around a shared zero line, and the constituents
 * underneath once you open it.
 *
 * The whole row is the button — a comfortably large target rather than a small
 * chevron — and the chevron is always visible rather than appearing on hover,
 * since a hover-only affordance simply doesn't exist on touch. The percentage
 * is always written out with its sign, so the bar's colour and direction are
 * reinforcement rather than the only carrier of meaning.
 */
export function SectorRow({ sector, scale, expanded, onToggle, index, grown }: Props) {
  const { t } = useTranslation('discover');
  const entry = SECTOR_BY_KEY.get(sector.key);
  const Icon = entry?.icon;
  const pct = sector.changePct;
  const positive = pct != null && pct >= 0;
  const panelId = `sector-panel-${sector.key}`;
  const prefersReducedMotion = useReducedMotion();

  // Half the track is available on each side of the zero line.
  const width = pct != null && scale > 0 ? Math.min(50, (Math.abs(pct) / scale) * 50) : 0;

  const { data, isLoading } = useQuery<{ success: boolean; items: TickerItem[] }>({
    queryKey: ['discover-sector', sector.key],
    queryFn: async () => {
      const res = await fetch(`/api/discover/sector/${sector.key}`);
      if (!res.ok) throw new Error(`Sector failed: ${res.status}`);
      return res.json();
    },
    // Fetch only once opened, then keep it — reopening costs nothing.
    enabled: expanded,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  return (
    <li className="border-b border-border/25 last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={panelId}
        className={cn(
          'flex w-full items-center gap-3 px-3 py-2.5 text-left sm:gap-4 sm:px-4',
          'transition-colors duration-150 hover:bg-muted/25',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary',
        )}
      >
        {/* Label */}
        <span className="flex min-w-0 shrink-0 items-center gap-2 basis-[112px] sm:basis-[196px]">
          <ChevronDown
            className={cn(
              'h-3.5 w-3.5 shrink-0 text-muted-foreground/80 transition-transform duration-200',
              expanded && 'rotate-180',
            )}
            aria-hidden
          />
          {Icon && <Icon className="hidden h-3.5 w-3.5 shrink-0 text-muted-foreground/85 sm:block" aria-hidden />}
          <span className="truncate text-[13px] font-medium text-foreground">{sector.label}</span>
        </span>

        {/* Diverging bar. Decorative — the signed percentage beside it carries
            the meaning for anyone who can't distinguish the colours. */}
        <span className="relative h-5 min-w-0 flex-1" aria-hidden>
          <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border/50" />
          <span
            className={cn(
              'absolute top-1/2 h-2.5 -translate-y-1/2 rounded-sm transition-transform duration-300 ease-out',
              positive ? 'left-1/2 origin-left bg-emerald-400/85' : 'right-1/2 origin-right bg-red-400/85',
            )}
            style={{
              width: `${width}%`,
              transform: `scaleX(${grown ? 1 : 0})`,
              transitionDelay: `${index * 25}ms`,
            }}
          />
        </span>

        {/* Value */}
        <span
          className={cn(
            'shrink-0 basis-[68px] text-right font-mono text-[13px] font-semibold tabular-nums sm:basis-[80px]',
            pct == null
              ? 'text-muted-foreground/85'
              : positive
                ? 'text-emerald-400'
                : 'text-red-400',
          )}
        >
          {fmtPct(pct)}
        </span>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            id={panelId}
            key="panel"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            // Framer Motion drives this with rAF, not a CSS transition, so the
            // global `prefers-reduced-motion` rule in globals.css (which only
            // rewrites CSS animation/transition durations) can't touch it —
            // confirmed by sampling the panel's height mid-toggle under a
            // reduced-motion emulation, which still showed it animating.
            // `useReducedMotion` is Framer's own hook for exactly this gap.
            transition={{ duration: prefersReducedMotion ? 0 : 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-4 pt-1 sm:px-4">
              {entry?.tagline && (
                <p className="mb-2.5 text-[11px] text-muted-foreground/80">
                  {t('sectorRowTaglineSuffix', { tagline: entry.tagline })}
                </p>
              )}

              {isLoading && (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6" aria-hidden>
                  {Array.from({ length: 6 }, (_, i) => (
                    <div key={i} className="h-[92px] rounded-xl border border-border/20 animate-shimmer" />
                  ))}
                </div>
              )}

              {!isLoading && data?.items && data.items.length > 0 && (
                <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                  {data.items.map((item) => (
                    <li key={item.symbol}>
                      <TickerCard item={item} />
                    </li>
                  ))}
                </ul>
              )}

              {!isLoading && (!data?.items || data.items.length === 0) && (
                <p className="text-xs text-muted-foreground/80">
                  {t('sectorRowLoadError')}
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}
