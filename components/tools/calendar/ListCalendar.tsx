'use client';

import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { slugToAssetPath } from '@/lib/assets/asset-type';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import { compactMetric } from './EventRows';
import { TYPE_ICONS, getTypeLabels } from './LogoTile';
import { fmtFullDate } from '@/lib/dates/calendar-format';
import type { DayModel, UnifiedEvent } from './types';

interface ListCalendarProps {
  days: DayModel[];
  today: string;
  mySymbols: Set<string>;
  holdingSymbols: Set<string>;
  onOpenDay: (date: string) => void;
}

/** Rows rendered per day before deferring the rest to the day dialog. */
const ROWS_PER_DAY = 12;

function EventListRow({ event, isMine, isOwned }: { event: UnifiedEvent; isMine: boolean; isOwned: boolean }) {
  const { t } = useTranslation('tools');
  const typeLabels = getTypeLabels(t);
  const Icon = TYPE_ICONS[event.type];
  const metric = compactMetric(event);
  const href = event.symbol ? slugToAssetPath(event.symbol) : null;

  const inner = (
    <>
      <CompanyLogo
        name={event.name || event.symbol}
        ticker={event.symbol}
        logoUrl={event.logoUrl}
        size={32}
        loading="eager"
        className={cn('rounded-md ring-1 ring-border/40', isMine && 'ring-2 ring-primary')}
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="font-mono text-sm font-bold text-foreground">{event.symbol || '—'}</span>
          {isMine && (
            <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-xs font-semibold leading-none text-primary">
              {isOwned ? t('calendarOwnedBadge') : t('calendarWatchingBadge')}
            </span>
          )}
        </span>
        {event.name && (
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">{event.name}</span>
        )}
      </span>
      <span className="flex shrink-0 items-center gap-2.5">
        <span className="flex items-center gap-1 text-xs text-muted-foreground/70">
          <Icon className="h-3 w-3" aria-hidden />
          <span className="hidden sm:inline">{typeLabels[event.type]}</span>
        </span>
        {metric && (
          <span className="font-mono text-sm tabular-nums text-foreground/90">{metric}</span>
        )}
      </span>
    </>
  );

  const rowClass =
    'flex items-center gap-3 rounded-lg px-2 py-2.5 -mx-2 transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

  // Pre-listing IPO rows can have an empty symbol, which would produce a
  // broken link — render those as plain rows instead.
  return href ? (
    <Link href={href} className={rowClass}>{inner}</Link>
  ) : (
    <div className={rowClass}>{inner}</div>
  );
}

/**
 * Agenda view: every day in range as a labelled group of full-width rows.
 *
 * This is the primary view on phones — a 7-column grid at 375px leaves ~41px
 * per column, too narrow for a logo and a ticker — and an alternative to the
 * grids on desktop for anyone who would rather read a schedule than scan one.
 * Empty days are skipped entirely rather than rendered as blank headers.
 */
export function ListCalendar({ days, today, mySymbols, holdingSymbols, onOpenDay }: ListCalendarProps) {
  const { t } = useTranslation('tools');
  const withEvents = days.filter((d) => d.total > 0);

  if (withEvents.length === 0) return null;

  return (
    <div className="flex flex-col">
      {withEvents.map((day) => {
        const rows = [...day.mine, ...day.others].slice(0, ROWS_PER_DAY);
        const hidden = day.total - rows.length;
        const isToday = day.date === today;

        return (
          <section key={day.date} className="border-b border-border/40 last:border-b-0">
            <h3
              className={cn(
                'sticky top-14 z-10 flex items-baseline justify-between gap-3 bg-card/95 py-2 backdrop-blur',
                'text-xs font-bold uppercase tracking-wide',
                isToday ? 'text-primary' : 'text-muted-foreground/70',
              )}
            >
              <span>
                {fmtFullDate(day.date)}
                {isToday && <span className="ml-1.5 normal-case tracking-normal">{t('calendarTodaySuffix')}</span>}
              </span>
              <span className="font-mono tabular-nums text-muted-foreground/60">{day.total}</span>
            </h3>

            <div className="flex flex-col pb-2">
              {rows.map((event, i) => (
                <EventListRow
                  key={`${event.type}-${event.symbol}-${i}`}
                  event={event}
                  isMine={mySymbols.has(event.symbol.toUpperCase())}
                  isOwned={holdingSymbols.has(event.symbol.toUpperCase())}
                />
              ))}

              {hidden > 0 && (
                <button
                  type="button"
                  onClick={() => onOpenDay(day.date)}
                  className="mt-1 self-start rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {t('calendarShowMoreOn', { count: hidden, date: fmtFullDate(day.date) })}
                </button>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
