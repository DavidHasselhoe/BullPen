'use client';

import { useCallback, useSyncExternalStore } from 'react';

const STORAGE_KEY = 'bullpen-recently-compared';
const MAX_ITEMS = 5;

export interface RecentComparedCompany {
  ticker: string;
  name: string;
  logo_url: string | null;
}

export interface RecentComparison {
  tickers: string[];
  companies: RecentComparedCompany[];
  comparedAt: number;
}

// Same module-level store + useSyncExternalStore pattern as useRecentlyViewed
// (hooks/use-recently-viewed.ts) — every mounted instance shares one snapshot
// and gets notified on change, so a comparison saved on the results page is
// picked up by the picker screen without needing a remount.

let cache: RecentComparison[] | null = null;
const listeners = new Set<() => void>();

function readFromStorage(): RecentComparison[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentComparison[];
    // Enforced on read too, not just in add() — keeps the cap honest even if
    // the key was ever written by something other than this hook.
    return Array.isArray(parsed) ? parsed.slice(0, MAX_ITEMS) : [];
  } catch {
    return [];
  }
}

function writeToStorage(items: RecentComparison[]) {
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
  // Cross-tab sync — same-tab updates rely on emitChange() from add()/clear().
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) emitChange();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

function getSnapshot(): RecentComparison[] {
  if (cache === null) cache = readFromStorage();
  return cache;
}

const EMPTY: RecentComparison[] = [];
function getServerSnapshot(): RecentComparison[] {
  return EMPTY;
}

/** Order-independent — comparing [AAPL, MSFT] then [MSFT, AAPL] updates the same entry. */
function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((t, i) => t === sortedB[i]);
}

export function useRecentlyCompared() {
  const items = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const add = useCallback((companies: RecentComparedCompany[]) => {
    const tickers = companies.map((c) => c.ticker.toUpperCase());
    const entry: RecentComparison = { tickers, companies, comparedAt: Date.now() };
    const current = getSnapshot();
    const filtered = current.filter((c) => !sameSet(c.tickers, tickers));
    const next = [entry, ...filtered].slice(0, MAX_ITEMS);
    writeToStorage(next);
    emitChange();
  }, []);

  const clear = useCallback(() => {
    writeToStorage([]);
    emitChange();
  }, []);

  return { items, add, clear };
}
