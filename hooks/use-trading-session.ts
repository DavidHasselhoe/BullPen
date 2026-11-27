'use client';

import { useEffect, useState } from 'react';
import { tradingMinutesET } from '@/lib/market-data/trading-day';

export type TradingSession = 'pre-market' | 'regular' | 'after-hours' | 'closed';

/**
 * US equity session by the ET clock. Weekends and full-day holidays are
 * 'closed' all day. ponytail: half days (13:00 close) still read 'regular'
 * until 16:00; teach trading-day.ts the early-close rules if that matters.
 */
export function getSessionState(now = new Date()): TradingSession {
  const etMins = tradingMinutesET(now);
  if (etMins == null) return 'closed';
  if (etMins >= 240 && etMins < 570) return 'pre-market';  // 4:00–9:30 AM ET
  if (etMins >= 570 && etMins < 960) return 'regular';     // 9:30 AM–4:00 PM ET
  if (etMins >= 960 && etMins < 1200) return 'after-hours'; // 4:00–8:00 PM ET
  return 'closed';
}

export function useTradingSession(): TradingSession {
  const [session, setSession] = useState<TradingSession>(getSessionState);
  useEffect(() => {
    const id = setInterval(() => setSession(getSessionState()), 60_000);
    return () => clearInterval(id);
  }, []);
  return session;
}
