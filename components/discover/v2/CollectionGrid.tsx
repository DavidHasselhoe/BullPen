'use client';

import { cn } from '@/lib/utils';
import type { TickerItem } from '@/lib/discover/discover-config';
import { TickerCard } from './TickerCard';

interface Props {
  title: string;
  /** Why this list exists. Not decoration — it's what makes the list a list. */
  description: string;
  items: TickerItem[];
  /** Render each card's `reason` in place of the company name. */
  showReason?: boolean;
  className?: string;
}

/**
 * A static grid of names with a stated reason for existing.
 *
 * Deliberately not a carousel. Auto-advancing rails measure ~1% engagement and
 * train users to tune the region out entirely, which is what nineteen of them
 * did to this page. Six cards that hold still and say why they're there beat
 * twelve that slide past.
 */
export function CollectionGrid({ title, description, items, showReason, className }: Props) {
  if (items.length === 0) return null;

  return (
    <section className={cn('min-w-0', className)}>
      <h3 className="text-[13px] font-semibold text-foreground">{title}</h3>
      <p className="mb-3 mt-0.5 text-[11px] leading-relaxed text-muted-foreground/65">{description}</p>

      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {items.map((item) => (
          <li key={item.symbol}>
            <TickerCard item={item} showReason={showReason} />
          </li>
        ))}
      </ul>
    </section>
  );
}
