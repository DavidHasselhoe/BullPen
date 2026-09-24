'use client';

import { CalendarClock } from 'lucide-react';
import { nextFilingDeadline, daysUntil, isInFilingWindow } from '@/lib/institutions/filing-schedule';
import { cn } from '@/lib/utils';

/**
 * When the next 13F is due, for a reader looking at data that is by design
 * weeks old. "Filed Aug 14 for the quarter ended Jun 30" answers how stale
 * this is; it doesn't answer the next question, which is when it stops being
 * stale. A follower of the fund is really asking when they get notified.
 *
 * States the deadline, never a guess at the day: every manager shares the same
 * Rule 13f-1 deadline, but which day inside the window they pick is nobody's
 * to know in advance (see lib/institutions/filing-schedule.ts). During the
 * filing window the copy shifts to "any day now", which is the true statement
 * then: 72% of the filings this app has ingested landed on the deadline day
 * itself.
 */
export function NextFilingNote({ className }: { className?: string }) {
  const { deadline } = nextFilingDeadline();
  const days = daysUntil(deadline);
  const imminent = isInFilingWindow();

  const when = new Date(`${deadline}T12:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });

  return (
    <p className={cn('flex items-center gap-1.5 text-xs text-muted-foreground', className)}>
      <CalendarClock className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>
        Next 13F due {when}
        {imminent
          ? '. Most funds file on the deadline day, so new holdings can land any day now.'
          : `, in ${days} days. Every fund files on the same quarterly deadline.`}
      </span>
    </p>
  );
}
