'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { createBrowserClient } from '@/lib/supabase/client';
import {
  CALENDAR_PREFS_KEY,
  CALENDAR_PREF_DEFAULTS,
  parseCalendarPrefs,
  type CalendarPrefs,
} from '@/lib/market-data/calendar-prefs';

const STORAGE_KEY = 'calendar-prefs';

function subscribeStorage(onChange: () => void) {
  window.addEventListener('storage', onChange);
  return () => window.removeEventListener('storage', onChange);
}
function readStorage(): string | null {
  try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
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
  // Through useSyncExternalStore, not a useState initializer: the server has no
  // localStorage, so reading it on the first client render made the filter
  // chips hydrate differently from the server HTML (a hydration error for
  // anyone with saved filters). The server snapshot is null, so hydration uses
  // the defaults and the saved copy applies right after.
  const localRaw = useSyncExternalStore(subscribeStorage, readStorage, () => null);
  const local = useMemo<CalendarPrefs>(() => {
    if (!localRaw) return CALENDAR_PREF_DEFAULTS;
    try { return parseCalendarPrefs(JSON.parse(localRaw)); } catch { return CALENDAR_PREF_DEFAULTS; }
  }, [localRaw]);
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
