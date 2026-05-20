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
}: Props) {
  const headingId = useId();
  const trackRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);
  const isDragging = useRef(false);
  const dragOrigin = useRef({ x: 0, scrollLeft: 0 });

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
          className="discover-rail-track flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2 -mb-2 md:cursor-grab"
          style={{ animation: 'none' }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={stopDrag}
          onMouseLeave={stopDrag}
        >
          {items.map((item, i) => (
            <div key={`${item.symbol}-${i}`} role="listitem" className="snap-start shrink-0">
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
