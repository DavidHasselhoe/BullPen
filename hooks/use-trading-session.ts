'use client';

import { useEffect, useState } from 'react';

export type TradingSession = 'pre-market' | 'regular' | 'after-hours' | 'closed';

/** US equity session by the ET clock. Holidays read as a normal weekday. */
export function getSessionState(): TradingSession {
  const nowET = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = nowET.getDay();
  if (day === 0 || day === 6) return 'closed';
  const etMins = nowET.getHours() * 60 + nowET.getMinutes();
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
