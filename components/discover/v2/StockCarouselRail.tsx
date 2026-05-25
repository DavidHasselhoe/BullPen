'use client';

import { useId, useRef, useState, useCallback, useEffect, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TickerCard } from './TickerCard';
import type { TickerItem } from '@/lib/discover/discover-config';

interface Props {
  title: string;
  subtitle?: string;
  accent?: string;
  icon?: ReactNode;
  meta?: string;
  items: TickerItem[];
  hrefForItem?: (item: TickerItem) => string;
  /** Auto-scroll pixels per second. Pass 0 (or omit) to disable. */
  speed?: number;
}

const CARD_WIDTH = 168;
const GAP_PX = 12;
const SCROLL_CARDS = 5;
const SCROLL_AMOUNT = (CARD_WIDTH + GAP_PX) * SCROLL_CARDS;

export function StockCarouselRail({
  title,
  subtitle,
  accent = 'bg-primary',
  icon,
  meta,
  items,
  hrefForItem,
  speed = 0,
}: Props) {
  const headingId = useId();
  const trackRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);
  const isDragging = useRef(false);
  const dragOrigin = useRef({ x: 0, scrollLeft: 0 });
  const isHovering = useRef(false);

  const updateArrows = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
  }, []);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    updateArrows();
    el.addEventListener('scroll', updateArrows, { passive: true });
    const ro = new ResizeObserver(updateArrows);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', updateArrows); ro.disconnect(); };
  }, [updateArrows]);

  // ── Auto-scroll loop ───────────────────────────────────────────────────────
  // Continuous left-to-right scroll. Pauses while hovered or being dragged.
  // Skips when the user prefers reduced motion. Uses requestAnimationFrame so
  // the speed feels native and never jumps. We render the items twice (see
  // below) so seamless wrap-around feels infinite — when scrollLeft passes the
  // halfway mark, we subtract one set's width and continue.
  useEffect(() => {
    if (speed <= 0) return;
    const el = trackRef.current;
    if (!el) return;
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    let raf = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      if (!isHovering.current && !isDragging.current) {
        const half = el.scrollWidth / 2;
        let next = el.scrollLeft + speed * dt;
        if (half > 0 && next >= half) next -= half;
        el.scrollLeft = next;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [speed, items.length]);

  const scroll = (dir: 'left' | 'right') =>
    trackRef.current?.scrollBy({
      left: dir === 'left' ? -SCROLL_AMOUNT : SCROLL_AMOUNT,
      behavior: 'smooth',
    });

  const onMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!trackRef.current) return;
    isDragging.current = true;
    dragOrigin.current = { x: e.pageX, scrollLeft: trackRef.current.scrollLeft };
    trackRef.current.style.cursor = 'grabbing';
    trackRef.current.style.userSelect = 'none';
  };

  const onMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging.current || !trackRef.current) return;
    e.preventDefault();
    trackRef.current.scrollLeft = dragOrigin.current.scrollLeft - (e.pageX - dragOrigin.current.x);
  };

  const stopDrag = () => {
    if (!trackRef.current) return;
    isDragging.current = false;
    trackRef.current.style.cursor = '';
    trackRef.current.style.userSelect = '';
  };

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

  return (
    <section aria-labelledby={headingId} className="min-w-0">
      <Header id={headingId} title={title} subtitle={subtitle} accent={accent} icon={icon} meta={meta} />

      <div className="relative group/rail">
        {/* Left arrow — desktop only, fades in on hover */}
        <button
          onClick={() => scroll('left')}
          aria-label="Scroll left"
          className={cn(
            'absolute left-0 top-1/2 -translate-y-1/2 -translate-x-3 z-10',
            'hidden md:flex items-center justify-center',
            'w-7 h-7 rounded-full bg-background border border-border/60 shadow-md',
            'text-muted-foreground hover:text-foreground transition-all duration-150',
            'opacity-0 group-hover/rail:opacity-100',
            !canScrollLeft && '!opacity-0 pointer-events-none',
          )}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        {/* Right arrow */}
        <button
          onClick={() => scroll('right')}
          aria-label="Scroll right"
          className={cn(
            'absolute right-0 top-1/2 -translate-y-1/2 translate-x-3 z-10',
            'hidden md:flex items-center justify-center',
            'w-7 h-7 rounded-full bg-background border border-border/60 shadow-md',
            'text-muted-foreground hover:text-foreground transition-all duration-150',
            'opacity-0 group-hover/rail:opacity-100',
            !canScrollRight && '!opacity-0 pointer-events-none',
          )}
        >
          <ChevronRight className="h-4 w-4" />
        </button>

        {/* Scrollable track */}
        <div
          ref={trackRef}
          role="list"
          className={cn(
            'flex gap-3 overflow-x-auto pb-2 -mb-2 md:cursor-grab scrollbar-hide',
            // Snap only when auto-scroll is off, so the rAF loop isn't fighting CSS snap points
            speed > 0 ? '' : 'snap-x snap-mandatory'
          )}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={stopDrag}
          onMouseLeave={() => { isHovering.current = false; stopDrag(); }}
          onMouseEnter={() => { isHovering.current = true; }}
        >
          {items.map((item, i) => (
            <div key={`${item.symbol}-${i}`} role="listitem" className={cn('shrink-0', speed > 0 ? '' : 'snap-start')}>
              <TickerCard item={item} href={hrefForItem?.(item)} />
            </div>
          ))}
          {/* Mirror copy enables seamless wrap-around when auto-scrolling */}
          {speed > 0 && items.map((item, i) => (
            <div
              key={`${item.symbol}-${i}-mirror`}
              role="presentation"
              aria-hidden
              className="shrink-0"
            >
              <TickerCard item={item} href={hrefForItem?.(item)} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Header({
  id, title, subtitle, accent, icon, meta,
}: {
  id: string; title: string; subtitle?: string; accent: string; icon?: ReactNode; meta?: string;
}) {
  return (
    <div className="flex items-end justify-between gap-3 mb-3">
      <div className="flex items-center gap-2.5 min-w-0">
        <span className={cn('w-1.5 h-5 rounded-full shrink-0', accent)} aria-hidden />
        {icon && <span className="shrink-0 text-muted-foreground/70">{icon}</span>}
        <div className="min-w-0">
          <h3 id={id} className="text-base font-semibold text-foreground leading-none">{title}</h3>
          {subtitle && <p className="text-[11px] text-muted-foreground/60 truncate mt-1">{subtitle}</p>}
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
