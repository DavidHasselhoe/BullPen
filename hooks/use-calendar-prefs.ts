'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { createBrowserClient } from '@/lib/supabase/client';
import {
  CALENDAR_PREFS_KEY,
  CALENDAR_PREF_DEFAULTS,
  parseCalendarPrefs,
  type CalendarPrefs,
} from '@/lib/market-data/calendar-prefs';

const STORAGE_KEY = 'calendar-prefs';

function loadLocal(): CalendarPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? parseCalendarPrefs(JSON.parse(raw)) : CALENDAR_PREF_DEFAULTS;
  } catch {
    return CALENDAR_PREF_DEFAULTS;
  }
}

/**
 * Market Calendar filters. Signed in: saved to users.settings.calendar_prefs
 * so they follow the user across devices (and drive which economic releases
 * notify them). Signed out: this browser only.
 */
export function useCalendarPrefs() {
  const { user } = useAuth();
  // Null until the user changes something: until then the account's saved
  // prefs (or this browser's) are the source of truth.
  const [edited, setEdited] = useState<CalendarPrefs | null>(null);
  const [local] = useState<CalendarPrefs>(() => (typeof window === 'undefined' ? CALENDAR_PREF_DEFAULTS : loadLocal()));
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userIdRef = useRef(user?.id);
  useEffect(() => { userIdRef.current = user?.id; }, [user?.id]);

  const prefs = useMemo<CalendarPrefs>(() => {
    if (edited) return edited;
    const remote = (user?.settings as Record<string, unknown> | undefined)?.[CALENDAR_PREFS_KEY];
    return remote ? parseCalendarPrefs(remote) : local;
  }, [edited, user?.settings, local]);

  const update = useCallback((partial: Partial<CalendarPrefs>) => {
    const next = { ...prefs, ...partial };
    setEdited(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* private mode */ }

    if (!userIdRef.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    // Debounced, and merged into the settings row as it is now in the DB, not
    // the copy loaded with the page: that copy would overwrite anything saved
    // since (theme, notification toggles...).
    saveTimer.current = setTimeout(async () => {
      const id = userIdRef.current;
      if (!id) return;
      try {
        const supabase = createBrowserClient();
        const { data } = await supabase.from('users').select('settings').eq('id', id).single();
        const settings = (data?.settings as Record<string, unknown>) ?? {};
        await supabase.from('users').update({ settings: { ...settings, [CALENDAR_PREFS_KEY]: next } }).eq('id', id);
      } catch { /* non-critical: the browser copy still holds */ }
    }, 800);
  }, [prefs]);

  return { prefs, update };
}
