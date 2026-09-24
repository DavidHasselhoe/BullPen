'use client';

import { useState } from 'react';
import { HelpCircle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { TickerItem } from '@/lib/discover/discover-config';
import { TickerCard } from './TickerCard';

interface Props {
  title: string;
  items: TickerItem[];
  /** Render each card's `reason` in place of the company name. */
  showReason?: boolean;
  /** Why this list exists — behind a "?" next to the title. `label` is the
   *  question (the button's accessible name), `body` the answer. */
  help?: { label: string; body: string };
  className?: string;
}

/**
 * A static grid of names with a stated reason for existing.
 *
 * Deliberately not a carousel. Auto-advancing rails measure ~1% engagement and
 * train users to tune the region out entirely, which is what nineteen of them
 * did to this page. Six cards that hold still beat twelve that slide past.
 *
 * The "why this list exists" copy sits behind the "?" on the title. It was a
 * paragraph under every title once, then a row of accordions under all four
 * grids — both kept reasoning nobody asked for on screen, between the reader
 * and the tickers. A curious reader still gets it in one hover.
 */
export function CollectionGrid({ title, items, showReason, help, className }: Props) {
  if (items.length === 0) return null;

  return (
    <section className={cn('min-w-0', className)}>
      <div className="mb-3 flex items-center gap-1">
        <h3 className="text-[13px] font-semibold text-foreground">{title}</h3>
        {help && <HelpTip label={help.label} body={help.body} />}
      </div>

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

/**
 * Controlled rather than Radix's default: a Radix tooltip opens on hover and
 * focus but never on tap, so on a phone the answer would be unreachable.
 * Opening it on click too costs one line of state and keeps hover, keyboard
 * focus and touch all working.
 */
function HelpTip({ label, body }: { label: string; body: string }) {
  const [open, setOpen] = useState(false);

  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          onClick={() => setOpen(true)}
          className={cn(
            'inline-flex h-7 w-7 -my-1 items-center justify-center rounded-full',
            'text-muted-foreground transition-colors duration-150 hover:text-foreground',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
          )}
        >
          <HelpCircle className="h-3.5 w-3.5" aria-hidden />
        </button>
      </TooltipTrigger>
      {/* The arrow is styled bg-primary inside the tooltip primitive, so
          recolouring only the bubble leaves a bright wedge hanging off a dark
          panel. Primary is the brand accent and DESIGN.md reserves that for
          gain/loss, which is why the bubble is popover in the first place. */}
      <TooltipContent
        side="top"
        sideOffset={4}
        className={cn(
          'max-w-[260px] border border-border bg-popover text-popover-foreground shadow-lg',
          '[&_svg]:bg-popover [&_svg]:fill-popover',
        )}
      >
        <p className="text-xs leading-relaxed">{body}</p>
      </TooltipContent>
    </Tooltip>
  );
}
