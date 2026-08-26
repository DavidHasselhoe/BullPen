'use client';

import { useTranslation } from 'react-i18next';
import { List, CalendarRange, CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type CalendarView = 'list' | 'week' | 'month';

/**
 * Segmented control for the three views.
 *
 * Uses the app's established pattern (components/stock/advanced-chart/
 * ChartToolbar.tsx): a bordered muted track with the active child raised on
 * `bg-background`, and labels that collapse to icons on small screens. This
 * replaces a three-pill group that conflated "which view" with "which month"
 * ("This week" / "This month" / "Next month"), which is why the old build had
 * no way to page to an arbitrary week.
 */
export function CalendarViewToggle({
  view,
  onChange,
}: {
  view: CalendarView;
  onChange: (v: CalendarView) => void;
}) {
  const { t } = useTranslation('tools');
  const VIEWS: { value: CalendarView; label: string; Icon: typeof List }[] = [
    { value: 'list', label: t('calendarViewList'), Icon: List },
    { value: 'week', label: t('calendarViewWeek'), Icon: CalendarRange },
    { value: 'month', label: t('calendarViewMonth'), Icon: CalendarDays },
  ];
  return (
    <div
      role="group"
      aria-label={t('calendarViewGroupAriaLabel')}
      className="flex items-center gap-0.5 rounded-lg border border-border bg-muted/40 p-0.5"
    >
      {VIEWS.map(({ value, label, Icon }) => {
        const active = view === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => onChange(value)}
            aria-pressed={active}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              active
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden />
            <span className="hidden sm:inline">{label}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Previous / label / next, plus a Today button that only appears when the
 * anchor has moved off the current period. Mirrors the date nav in
 * components/holdings/performance-calendar/PerformanceCalendar.tsx.
 */
export function CalendarDateNav({
  label,
  prevLabel,
  nextLabel,
  onPrev,
  onNext,
  onToday,
  showToday,
  disabled,
}: {
  label: string;
  prevLabel: string;
  nextLabel: string;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  showToday: boolean;
  disabled?: boolean;
}) {
  const { t } = useTranslation('tools');
  return (
    <div className="flex items-center gap-1">
      {showToday && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onToday}
          className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
        >
          {t('calendarTodayButton')}
        </Button>
      )}
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={onPrev}
        disabled={disabled}
        aria-label={prevLabel}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span className="min-w-[132px] text-center font-mono text-xs tabular-nums text-muted-foreground/85">
        {label}
      </span>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={onNext}
        disabled={disabled}
        aria-label={nextLabel}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
