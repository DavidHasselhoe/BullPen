'use client';

import Link from 'next/link';
import type { ElementType } from 'react';
import { TrendingUp, DollarSign, Scissors, Rocket } from 'lucide-react';
import { slugToAssetPath } from '@/lib/assets/asset-type';
import { fmtDayHeader } from '@/lib/dates/calendar-format';
import type { DayModel, EventType } from './types';

const TYPE_LABELS: Record<EventType, string> = {
  earnings: 'Earnings',
  dividends: 'Ex-dividend',
  splits: 'Split',
  ipo: 'IPO',
};

const TYPE_ICONS: Record<EventType, ElementType> = {
  earnings: TrendingUp,
  dividends: DollarSign,
  splits: Scissors,
  ipo: Rocket,
};

/** Horizontally-scrollable chip row of the user's own holdings/watchlist events this week. */
export function YourWeekStrip({ days }: { days: DayModel[] }) {
  const items = days.flatMap((day) => day.mine.map((event) => ({ event, date: day.date })));
  if (items.length === 0) return null;

  return (
    <div className="mb-6 -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      {items.map(({ event, date }, i) => {
        const Icon = TYPE_ICONS[event.type];
        return (
          <Link
            key={`${event.type}-${event.symbol}-${i}`}
            href={slugToAssetPath(event.symbol)}
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-emerald-500/50"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />
            <Icon className="h-3 w-3 text-muted-foreground/80" aria-hidden />
            <span className="font-bold font-mono">{event.symbol}</span>
            <span className="text-muted-foreground/85">{TYPE_LABELS[event.type]}</span>
            <span className="text-muted-foreground/70">{fmtDayHeader(date)}</span>
          </Link>
        );
      })}
    </div>
  );
}
