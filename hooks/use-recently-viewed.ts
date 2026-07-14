'use client';

import { useCallback, useSyncExternalStore } from 'react';

const STORAGE_KEY = 'bullpen-recently-viewed';
const MAX_ITEMS = 8;

export interface RecentlyViewedCompany {
  ticker: string;
  name: string;
  logo_url?: string | null;
  instrument_type?: string;
  viewedAt: number;
}

// Module-level store shared by every component that calls useRecentlyViewed().
// Plain per-component useState(loadFromStorage) looked fine but meant each
// mounted instance held its own private copy: the stock page's `add()` call
// updated localStorage, but an already-mounted dashboard widget never learned
// about it (no unmount/remount happened, and localStorage's own `storage`
// event never fires in the tab that made the write) — so "recent" silently
// went stale until a hard reload. useSyncExternalStore fixes this by giving
// every instance the same snapshot and notifying all of them on any change.

let cache: RecentlyViewedCompany[] | null = null;
const listeners = new Set<() => void>();

function readFromStorage(): RecentlyViewedCompany[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentlyViewedCompany[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeToStorage(items: RecentlyViewedCompany[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // ignore
  }
}

function emitChange() {
  cache = null;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Cross-tab sync — the native storage event only fires in *other* tabs, so
  // same-tab updates still rely on emitChange() being called by add()/clear().
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) emitChange();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

function getSnapshot(): RecentlyViewedCompany[] {
  if (cache === null) cache = readFromStorage();
  return cache;
}

// Must be referentially stable across calls — useSyncExternalStore compares
// by reference and warns/loops if a fresh array is returned every time.
const EMPTY: RecentlyViewedCompany[] = [];
function getServerSnapshot(): RecentlyViewedCompany[] {
  return EMPTY;
}

export function useRecentlyViewed() {
  const items = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const add = useCallback((ticker: string, name: string, logo_url?: string | null, instrument_type?: string) => {
    const normalized = { ticker: ticker.toUpperCase(), name: name || ticker, logo_url: logo_url ?? null, instrument_type, viewedAt: Date.now() };
    const current = getSnapshot();
    const filtered = current.filter((p) => p.ticker !== normalized.ticker);
    const next = [normalized, ...filtered].slice(0, MAX_ITEMS);
    writeToStorage(next);
    emitChange();
  }, []);

  const clear = useCallback(() => {
    writeToStorage([]);
    emitChange();
  }, []);

  return { items, add, clear };
}
