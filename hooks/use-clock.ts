'use client';

import { useSyncExternalStore } from 'react';
import { getClock, getServerClock, subscribeClock, type Clock } from '@/lib/dates/clock';

/** The app's display clock (time zone + 12/24h). Re-renders when the user changes either. */
export function useClock(): Clock {
  return useSyncExternalStore(subscribeClock, getClock, getServerClock);
}
