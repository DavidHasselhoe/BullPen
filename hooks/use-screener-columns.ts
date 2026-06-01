'use client';

import { useCallback, useState } from 'react';
import { SCREENER_COLUMNS, COLUMN_BY_KEY, type ScreenerColumn } from '@/components/screener/screener-columns';

const STORAGE_KEY = 'screener-columns';

interface StoredPrefs {
  order: string[];   // ordered column keys (may omit keys added in later releases)
  hidden: string[];  // keys toggled off
}

/** Defaults for a user who has never configured their columns. */
function defaultPrefs(): StoredPrefs {
  return {
    order: SCREENER_COLUMNS.map((c) => c.key),
    hidden: SCREENER_COLUMNS.filter((c) => !c.defaultVisible).map((c) => c.key),
  };
}

function loadPrefs(): StoredPrefs {
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

function savePrefs(prefs: StoredPrefs) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // ignore
  }
}

/**
 * Resolve stored prefs into the full ordered key list.
 * Keys present in the registry but missing from stored order (e.g. columns
 * added in a later release) are appended at the end so they appear with their
 * default visibility instead of vanishing.
 */
function resolveOrder(order: string[]): string[] {
  const known = order.filter((k) => COLUMN_BY_KEY[k]);
  const missing = SCREENER_COLUMNS.filter((c) => !known.includes(c.key)).map((c) => c.key);
  return [...known, ...missing];
}

export interface UseScreenerColumns {
  /** Full ordered column list (for the chooser UI). */
  orderedColumns: ScreenerColumn[];
  /** Ordered + visible only (for the results table). */
  visibleColumns: ScreenerColumn[];
  isHidden: (key: string) => boolean;
  toggle: (key: string) => void;
  reorder: (keys: string[]) => void;
  reset: () => void;
}

export function useScreenerColumns(): UseScreenerColumns {
  const [prefs, setPrefs] = useState<StoredPrefs>(loadPrefs);

  const update = useCallback((next: StoredPrefs) => {
    setPrefs(next);
    savePrefs(next);
  }, []);

  const orderedKeys = resolveOrder(prefs.order);
  const hidden = new Set(prefs.hidden);

  const orderedColumns = orderedKeys.map((k) => COLUMN_BY_KEY[k]).filter(Boolean);
  const visibleColumns = orderedColumns.filter((c) => !hidden.has(c.key));

  const isHidden = useCallback((key: string) => prefs.hidden.includes(key), [prefs.hidden]);

  const toggle = useCallback((key: string) => {
    const set = new Set(prefs.hidden);
    if (set.has(key)) set.delete(key);
    else set.add(key);
    update({ order: orderedKeys, hidden: [...set] });
  }, [prefs.hidden, orderedKeys, update]);

  const reorder = useCallback((keys: string[]) => {
    update({ order: keys, hidden: prefs.hidden });
  }, [prefs.hidden, update]);

  const reset = useCallback(() => {
    setPrefs(defaultPrefs());
    if (typeof window !== 'undefined') {
      try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    }
  }, []);

  return { orderedColumns, visibleColumns, isHidden, toggle, reorder, reset };
}
