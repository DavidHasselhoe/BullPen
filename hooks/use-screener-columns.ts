'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SCREENER_COLUMNS, COLUMN_BY_KEY, type ScreenerColumn } from '@/components/screener/screener-columns';
import { useAuth } from '@/hooks/use-auth';
import { createBrowserClient } from '@/lib/supabase/client';

const STORAGE_KEY = 'screener-columns';
const SETTINGS_KEY = 'screener_columns';

interface StoredPrefs {
  order: string[];
  hidden: string[];
}

function defaultPrefs(): StoredPrefs {
  return {
    order: SCREENER_COLUMNS.map((c) => c.key),
    hidden: SCREENER_COLUMNS.filter((c) => !c.defaultVisible).map((c) => c.key),
  };
}

function loadLocal(): StoredPrefs {
  if (typeof window === 'undefined') return defaultPrefs();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultPrefs();
    const parsed = JSON.parse(raw) as Partial<StoredPrefs>;
    return {
      order: Array.isArray(parsed.order) ? parsed.order : [],
      hidden: Array.isArray(parsed.hidden) ? parsed.hidden : [],
    };
  } catch {
    return defaultPrefs();
  }
}

function saveLocal(prefs: StoredPrefs) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)); } catch { /* ignore */ }
}

/**
 * Keys in the registry but missing from stored order (added in later releases)
 * are appended at the end so they appear with their default visibility.
 */
function resolveOrder(order: string[]): string[] {
  const known = order.filter((k) => COLUMN_BY_KEY[k]);
  const missing = SCREENER_COLUMNS.filter((c) => !known.includes(c.key)).map((c) => c.key);
  return [...known, ...missing];
}

export interface UseScreenerColumns {
  orderedColumns: ScreenerColumn[];
  visibleColumns: ScreenerColumn[];
  isHidden: (key: string) => boolean;
  toggle: (key: string) => void;
  reorder: (keys: string[]) => void;
  reset: () => void;
}

export function useScreenerColumns(): UseScreenerColumns {
  const { user } = useAuth();

  // localPrefs: what the user has typed/dragged this session (or from localStorage).
  const [localPrefs, setLocalPrefs] = useState<StoredPrefs>(loadLocal);

  // Once the user makes a local change, local prefs win over the remote value
  // for the rest of this session (prevents the stale auth context from clobbering
  // in-session edits before the Supabase write propagates back).
  const [userEdited, setUserEdited] = useState(false);

  // Ref for user — updated via effect (not in render), read only in
  // event-handler / setTimeout callbacks where refs are permitted.
  const userRef = useRef(user);
  useEffect(() => { userRef.current = user; }, [user]);

  // Debounce timer ref — only accessed in callbacks, never in render.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Effective prefs: remote (user.settings) wins on first load; once the user
  // has edited anything this session, localPrefs wins until the next page load
  // (at which point Supabase will have the updated value).
  const prefs = useMemo<StoredPrefs>(() => {
    if (userEdited) return localPrefs;
    const remote = user?.settings?.[SETTINGS_KEY] as StoredPrefs | undefined;
    if (remote && Array.isArray(remote.order) && Array.isArray(remote.hidden)) return remote;
    return localPrefs;
  }, [user?.settings, localPrefs, userEdited]);

  const saveToSupabase = useCallback((next: StoredPrefs) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const currentUser = userRef.current;
      if (!currentUser) return;
      try {
        const supabase = createBrowserClient();
        const merged = { ...(currentUser.settings ?? {}), [SETTINGS_KEY]: next };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from('users').update({ settings: merged }).eq('id', currentUser.id);
      } catch { /* non-critical — localStorage is the fallback */ }
    }, 1_000);
  }, []);

  const update = useCallback((next: StoredPrefs) => {
    setUserEdited(true);
    setLocalPrefs(next);
    saveLocal(next);
    if (userRef.current) saveToSupabase(next);
  }, [saveToSupabase]);

  const orderedKeys = resolveOrder(prefs.order);
  const hidden = new Set(prefs.hidden);
  const orderedColumns = orderedKeys.map((k) => COLUMN_BY_KEY[k]).filter(Boolean);
  const visibleColumns = orderedColumns.filter((c) => !hidden.has(c.key));

  const isHidden = useCallback((key: string) => prefs.hidden.includes(key), [prefs.hidden]);

  const toggle = useCallback((key: string) => {
    const set = new Set(prefs.hidden);
    if (set.has(key)) set.delete(key); else set.add(key);
    update({ order: orderedKeys, hidden: [...set] });
  }, [prefs.hidden, orderedKeys, update]);

  const reorder = useCallback((keys: string[]) => {
    update({ order: keys, hidden: prefs.hidden });
  }, [prefs.hidden, update]);

  const reset = useCallback(() => {
    setUserEdited(false); // let remote prefs win again on next render if available
    const def = defaultPrefs();
    setLocalPrefs(def);
    saveLocal(def);
    if (userRef.current) saveToSupabase(def);
    if (typeof window !== 'undefined') {
      try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    }
  }, [saveToSupabase]);

  return { orderedColumns, visibleColumns, isHidden, toggle, reorder, reset };
}
