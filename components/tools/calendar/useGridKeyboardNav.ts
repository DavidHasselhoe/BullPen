'use client';

import { useCallback, useRef, useState } from 'react';
import type React from 'react';

/**
 * Roving tabindex for a 7-column day grid.
 *
 * Without it every non-empty day is its own tab stop — 31 of them in a month
 * view — so tabbing past the calendar to reach anything below it is punishing.
 * The grid becomes ONE tab stop; arrows move within it. Same approach as
 * components/holdings/performance-calendar/CalendarGrid.tsx, extracted here
 * because both market-calendar grids (week and month) need it.
 *
 * Cells opt in with a `data-cal-cell` attribute. Only `<button>` cells can
 * take focus, so empty days and month padding are walked past rather than
 * dead-ended on.
 */
export function useGridKeyboardNav(cols = 7) {
  const gridRef = useRef<HTMLDivElement>(null);
  const [activeDate, setActiveDate] = useState<string | null>(null);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const step =
        e.key === 'ArrowLeft' ? -1 :
        e.key === 'ArrowRight' ? 1 :
        e.key === 'ArrowUp' ? -cols :
        e.key === 'ArrowDown' ? cols :
        undefined;
      if (step === undefined || !gridRef.current) return;

      const cells = Array.from(gridRef.current.querySelectorAll<HTMLElement>('[data-cal-cell]'));
      const from = cells.findIndex((c) => c.contains(e.target as Node));
      if (from < 0) return;

      for (let i = from + step; i >= 0 && i < cells.length; i += step) {
        if (cells[i].tagName === 'BUTTON') {
          e.preventDefault();
          cells[i].focus();
          setActiveDate(cells[i].getAttribute('data-date'));
          return;
        }
      }
    },
    [cols]
  );

  return { gridRef, onKeyDown, activeDate, setActiveDate };
}
