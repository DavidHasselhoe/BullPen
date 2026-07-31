'use client';

import { CalendarDays } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { CurrencyCode } from '@/lib/currency/currency-conversion';
import { PerformanceCalendar } from './PerformanceCalendar';

interface Props {
  currency?: CurrencyCode;
  fxRate?: number;
}

/**
 * Card-chromed mount for the Holdings page, matching the Performance chart and
 * Allocation cards it sits beneath. The homepage widget deliberately skips this
 * wrapper — that stack uses editorial section headers, not Card chrome.
 */
export function PerformanceCalendarCard({ currency = 'USD', fxRate = 1 }: Props) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          Daily performance
        </CardTitle>
      </CardHeader>
      <CardContent>
        <PerformanceCalendar currency={currency} fxRate={fxRate} />
      </CardContent>
    </Card>
  );
}
