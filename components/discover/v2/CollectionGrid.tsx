'use client';

import { cn } from '@/lib/utils';
import type { TickerItem } from '@/lib/discover/discover-config';
import { TickerCard } from './TickerCard';

interface Props {
  title: string;
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
 * did to this page. Six cards that hold still beat twelve that slide past.
 *
 * The "why this list exists" copy that used to run under the title now lives
 * in the collapsed CollectionFAQ below the grids — always-on prose competed
 * with the tickers for attention; a closed-by-default answer doesn't.
 */
export function CollectionGrid({ title, items, showReason, className }: Props) {
  if (items.length === 0) return null;

  return (
    <section className={cn('min-w-0', className)}>
      <h3 className="mb-3 text-[13px] font-semibold text-foreground">{title}</h3>

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
