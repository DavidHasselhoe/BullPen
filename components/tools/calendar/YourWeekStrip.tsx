'use client';

import Link from 'next/link';
import { slugToAssetPath } from '@/lib/assets/asset-type';
import { fmtDayHeader } from '@/lib/dates/calendar-format';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import { TYPE_ICONS, TYPE_LABELS } from './LogoTile';
import type { DayModel } from './types';

/** Chips shown before collapsing into a count. A month view can otherwise
 *  produce dozens, which turns a glance-able strip into a second calendar. */
const MAX_CHIPS = 12;

/**
 * Horizontally-scrollable chip row of the user's own holdings/watchlist events
 * in the visible range.
 *
 * Chips are primary-tinted, not emerald. DESIGN.md's One Signal Rule reserves
 * emerald and red for gain/loss; using emerald for "this is yours" competes
 * with the one thing those colors are supposed to mean. The label text carries
 * the meaning anyway, so nothing depends on the color alone.
 */
export function YourWeekStrip({ days }: { days: DayModel[] }) {
  const items = days.flatMap((day) => day.mine.map((event) => ({ event, date: day.date })));
  if (items.length === 0) return null;

  const shown = items.slice(0, MAX_CHIPS);
  const hidden = items.length - shown.length;

  return (
    <div className="mb-6">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">
        Your events
      </p>
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {shown.map(({ event, date }, i) => {
          const Icon = TYPE_ICONS[event.type];
          return (
            <Link
              key={`${event.type}-${event.symbol}-${i}`}
              href={slugToAssetPath(event.symbol)}
              className="flex shrink-0 items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 py-1.5 pl-1.5 pr-3 text-xs font-medium text-foreground transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <CompanyLogo
                name={event.name || event.symbol}
                ticker={event.symbol}
                logoUrl={event.logoUrl}
                size={18}
                loading="eager"
                className="rounded-full"
              />
              <span className="font-mono font-bold">{event.symbol}</span>
              <Icon className="h-3 w-3 text-muted-foreground/80" aria-hidden />
              <span className="text-muted-foreground/85">{TYPE_LABELS[event.type]}</span>
              <span className="text-muted-foreground/70">{fmtDayHeader(date)}</span>
            </Link>
          );
        })}
        {hidden > 0 && (
          <span className="flex shrink-0 items-center rounded-full border border-border/60 px-3 py-1.5 text-xs text-muted-foreground">
            +{hidden} more
          </span>
        )}
      </div>
    </div>
  );
}
