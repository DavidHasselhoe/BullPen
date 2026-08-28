'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarDays } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { CurrencyCode } from '@/lib/currency/currency-conversion';
import { PerformanceCalendar } from './PerformanceCalendar';
import { PerformanceHeatStrip } from './PerformanceHeatStrip';

interface Props {
  currency?: CurrencyCode;
  fxRate?: number;
}

/**
 * Card-chromed mount for the Holdings page, matching the Performance chart and
 * Allocation cards it sits beneath. The homepage widget deliberately skips this
 * wrapper — that stack uses editorial section headers, not Card chrome.
 *
 * Defaults to the compact PerformanceHeatStrip (~90px) rather than the full
 * month grid (~500px+) — on the Holdings page the grid used to sit between
 * the charts and the holdings table, forcing a scroll past it to reach the
 * table on most screens. The full interactive calendar (month navigation,
 * per-day contributors) is unchanged, just moved behind "Expand" into a
 * dialog instead of being on the page by default.
 */
export function PerformanceCalendarCard({ currency = 'USD', fxRate = 1 }: Props) {
  const { t } = useTranslation('holdings');
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          {t('perfCalTitle')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <PerformanceHeatStrip currency={currency} fxRate={fxRate} onExpand={() => setExpanded(true)} />
      </CardContent>

      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="sm:max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              {t('perfCalTitle')}
            </DialogTitle>
          </DialogHeader>
          <PerformanceCalendar currency={currency} fxRate={fxRate} />
        </DialogContent>
      </Dialog>
    </Card>
  );
}
