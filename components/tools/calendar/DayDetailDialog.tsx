'use client';

import { useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DetailEventRow } from './EventRows';
import { EconomicDetailRow } from './EconomicEvents';
import { useCalendarEvents } from './useCalendarEvents';
import { buildDayModel } from './day-model';
import { fmtDayHeader } from '@/lib/dates/calendar-format';
import type { DayModel, EventType } from './types';

/** The calendar route's own ceiling. A busy earnings Thursday is ~115 tracked companies. */
const FULL_DAY = 200;

interface DayDetailDialogProps {
  model: DayModel | null;
  onOpenChange: (open: boolean) => void;
}

export function DayDetailDialog({ model, onOpenChange }: DayDetailDialogProps) {
  // The range query caps each day at the top 60 by market cap; the dialog is
  // where the rest of a busy day belongs, so it fetches that one day in full.
  const capped = model !== null && model.total > model.mine.length + model.others.length;
  const date = model?.date ?? '';
  const full = useCalendarEvents(date, date, { perDay: FULL_DAY, enabled: capped });

  const day = useMemo(() => {
    if (!model || !capped || full.isLoading || full.error) return model;
    // Same type filter and "mine" split the grid used: types with any count
    // passed the filter, and this day's mine rows carry the user's symbols.
    const types = new Set((Object.keys(model.typeCounts) as EventType[]).filter((t) => model.typeCounts[t] > 0));
    const mine = new Set(model.mine.map((e) => e.symbol.toUpperCase()));
    return buildDayModel(full.events, [model.date], mine, types, undefined, undefined, model.economic)[0];
  }, [model, capped, full.events, full.isLoading, full.error]);

  return (
    <Dialog open={model !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{model ? fmtDayHeader(model.date) : ''}</DialogTitle>
        </DialogHeader>
        {day && (
          <div className="divide-y divide-border/40">
            {day.economic.map((e) => <EconomicDetailRow key={e.id} event={e} />)}
            {[...day.mine, ...day.others].map((event, i) => (
              <DetailEventRow key={`${event.type}-${event.symbol}-${i}`} event={event} />
            ))}
            {capped && full.isLoading && (
              <div className="space-y-2 py-3" aria-hidden>
                {[0, 1, 2].map((i) => <div key={i} className="h-10 w-full animate-shimmer rounded" />)}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
