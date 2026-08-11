'use client';

import type { ElementType } from 'react';
import { TrendingUp, DollarSign, Scissors, Rocket } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import type { EventType, UnifiedEvent } from './types';

export const TYPE_ICONS: Record<EventType, ElementType> = {
  earnings: TrendingUp,
  dividends: DollarSign,
  splits: Scissors,
  ipo: Rocket,
};

export const TYPE_LABELS: Record<EventType, string> = {
  earnings: 'Earnings',
  dividends: 'Ex-dividend',
  splits: 'Split',
  ipo: 'IPO',
};

/**
 * Tile sizes, measured against the real container. `max-w-5xl` minus page and
 * card padding leaves ~920px inside the card; a 7-column week grid at gap-2
 * gives ~124px per cell (~108px usable after padding), and the month grid
 * ~114px. Mobile at 375px leaves only ~33px per column, which is why `xs`
 * exists and why the mobile month cell shows a single tile.
 */
export type TileSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export const LOGO_PX: Record<TileSize, number> = { xs: 16, sm: 20, md: 22, lg: 32, xl: 40 };

interface LogoTileProps {
  event: UnifiedEvent;
  size?: TileSize;
  /** Show the ticker beside (or under, in `stack`) the logo. Off in dense month cells. */
  showTicker?: boolean;
  /** Metric (EPS, dividend amount, split ratio) — right-aligned in `row`, centered under the ticker in `stack`. */
  metric?: string | null;
  /** In the user's holdings or watchlist. */
  isMine?: boolean;
  className?: string;
  /**
   * `row` (default): logo beside the ticker — the month grid and dense
   * contexts. `stack`: logo on top, ticker as a bold hero label underneath —
   * the week grid's larger cards, where a cell has room to spare vertically.
   */
  orientation?: 'row' | 'stack';
}

/**
 * A company logo + optional ticker, the atom every calendar view is built from.
 *
 * Logos are square-cornered (`rounded-md`) rather than circular: this reads as
 * a tile grid, and DESIGN.md reserves fully-round shapes for pills and the
 * landing CTA. `CompanyLogo` hardcodes `rounded-full` on its wrapper, so the
 * override is passed via className and clipped by that wrapper's own
 * `overflow-hidden`.
 *
 * "Mine" is a primary-colored ring, deliberately NOT the emerald dot this
 * replaced: DESIGN.md's One Signal Rule reserves emerald and red for gain and
 * loss, and using emerald for "you own this" teaches the wrong reflex. The
 * ring never carries the meaning alone either — the tile's aria-label says so,
 * and the "Your events" strip lists the same names in text.
 */
export function LogoTile({
  event,
  size = 'md',
  showTicker = true,
  metric,
  isMine = false,
  className,
  orientation = 'row',
}: LogoTileProps) {
  const px = LOGO_PX[size];
  const Icon = TYPE_ICONS[event.type];
  const label = `${event.symbol}${event.name ? `, ${event.name}` : ''}. ${TYPE_LABELS[event.type]}${
    isMine ? '. In your portfolio' : ''
  }`;

  const logo = (
    <span className="relative shrink-0 leading-none">
      <CompanyLogo
        name={event.name || event.symbol}
        ticker={event.symbol}
        logoUrl={event.logoUrl}
        size={px}
        loading="eager"
        className={cn(
          orientation === 'stack' ? 'rounded-lg ring-1 ring-border/40' : 'rounded-md ring-1 ring-border/40',
          isMine && 'ring-2 ring-primary',
        )}
      />
      {/* Non-earnings types get a tiny corner glyph so the tile grid stays
          readable when a day mixes types — colour alone would not do it. */}
      {event.type !== 'earnings' && (
        <span
          aria-hidden
          className="absolute -bottom-0.5 -right-0.5 flex h-2.5 w-2.5 items-center justify-center rounded-full bg-background ring-1 ring-border/60"
        >
          <Icon className="h-[7px] w-[7px] text-muted-foreground" />
        </span>
      )}
    </span>
  );

  if (orientation === 'stack') {
    // The week grid's larger cards: logo on top, ticker as a bold hero label
    // underneath, metric below that. Centered, since the tile stands alone in
    // its own grid cell rather than sharing a row with siblings.
    return (
      <span className={cn('flex flex-col items-center gap-1 text-center', className)} title={label}>
        {logo}
        {showTicker && (
          <span className="max-w-full truncate font-mono text-xs font-bold leading-none text-foreground">
            {event.symbol}
          </span>
        )}
        {metric && (
          <span className="max-w-full truncate font-mono text-xs leading-none text-muted-foreground/85 tabular-nums">
            {metric}
          </span>
        )}
        <span className="sr-only">{label}</span>
      </span>
    );
  }

  return (
    <span className={cn('flex items-center gap-1.5 min-w-0', className)} title={label}>
      {logo}

      {/* text-xs (0.75rem) is DESIGN.md's smallest documented step — the
          "Label" size. Deliberately not shrunk below it to fit more in: a
          7-column cell has ~108px of usable width, and a 22px logo plus a
          5-character mono ticker at 12px is ~64px, so the ramp fits. The
          metric hides at narrow widths instead of dropping off the ramp. */}
      {showTicker && (
        <span className="min-w-0 flex-1 truncate font-mono text-xs font-bold leading-none text-foreground">
          {event.symbol}
        </span>
      )}

      {metric && (
        <span className="hidden shrink-0 font-mono text-xs leading-none text-muted-foreground/85 tabular-nums xl:inline">
          {metric}
        </span>
      )}
      <span className="sr-only">{label}</span>
    </span>
  );
}
