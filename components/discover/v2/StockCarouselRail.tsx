'use client';

import { useId, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { TickerCard } from './TickerCard';
import type { TickerItem } from '@/lib/discover/discover-config';

interface Props {
  title: string;
  subtitle?: string;
  /** Tailwind bg-* class for the small accent dot beside the title (e.g. 'bg-sky-500') */
  accent?: string;
  /** Optional icon shown before the title */
  icon?: ReactNode;
  /** Optional right-side label, e.g. "12 stocks" or "Crypto" */
  meta?: string;
  items: TickerItem[];
  /** Optional href override per item — useful when canonical symbol differs from slugToAssetPath input */
  hrefForItem?: (item: TickerItem) => string;
  /**
   * Pixels per second for the auto-scroll. Default 18 — slow enough to read,
   * fast enough to feel alive. Skipped if user prefers reduced motion.
   */
  speed?: number;
}

const CARD_WIDTH = 168;
const GAP_PX = 12;

export function StockCarouselRail({
  title,
  subtitle,
  accent = 'bg-primary',
  icon,
  meta,
  items,
  hrefForItem,
  speed = 18,
}: Props) {
  const headingId = useId();

  if (items.length === 0) {
    return (
      <section aria-labelledby={headingId} className="min-w-0">
        <Header id={headingId} title={title} subtitle={subtitle} accent={accent} icon={icon} meta={meta} />
        <div className="h-[100px] rounded-xl border border-dashed border-border/40 flex items-center justify-center text-xs text-muted-foreground/50">
          No items
        </div>
      </section>
    );
  }

  // Duplicate the items so the marquee loop is seamless.
  const looped = items.concat(items);

  // The total scrollable width = (count * card + gap) but only the original half completes one loop.
  const trackWidth = items.length * (CARD_WIDTH + GAP_PX);
  const durationSec = Math.max(20, Math.round(trackWidth / speed));

  return (
    <section aria-labelledby={headingId} className="min-w-0">
      <Header id={headingId} title={title} subtitle={subtitle} accent={accent} icon={icon} meta={meta} />

      {/* Marquee container.
          - Desktop (md+): CSS marquee animation, paused on hover.
          - Mobile: native horizontal scroll (animation disabled via media query).
          - prefers-reduced-motion: animation disabled.
          - The page width clips overflow; only this strip scrolls.
      */}
      <div className="relative discover-rail-mask">
        <div
          className={cn(
            'discover-rail-track flex gap-3 overflow-x-auto md:overflow-hidden',
            'snap-x snap-mandatory md:snap-none',
            'pb-2 -mb-2', // hides the scrollbar visual gutter on mobile
          )}
          style={
            {
              // Custom property the keyframes reference. Halves keep the loop seamless.
              ['--rail-distance' as string]: `-${trackWidth}px`,
              ['--rail-duration' as string]: `${durationSec}s`,
            } as React.CSSProperties
          }
        >
          {looped.map((item, i) => (
            <div key={`${item.symbol}-${i}`} className="snap-start">
              <TickerCard item={item} href={hrefForItem?.(item)} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Header({
  id,
  title,
  subtitle,
  accent,
  icon,
  meta,
}: {
  id: string;
  title: string;
  subtitle?: string;
  accent: string;
  icon?: ReactNode;
  meta?: string;
}) {
  return (
    <div className="flex items-end justify-between gap-3 mb-3">
      <div className="flex items-center gap-2.5 min-w-0">
        <span className={cn('w-1.5 h-5 rounded-full shrink-0', accent)} aria-hidden />
        {icon && <span className="shrink-0 text-muted-foreground/70">{icon}</span>}
        <div className="min-w-0">
          <h3 id={id} className="text-base font-semibold text-foreground leading-none">
            {title}
          </h3>
          {subtitle && (
            <p className="text-[11px] text-muted-foreground/60 truncate mt-1">{subtitle}</p>
          )}
        </div>
      </div>
      {meta && (
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground/40 font-mono shrink-0">
          {meta}
        </span>
      )}
    </div>
  );
}
