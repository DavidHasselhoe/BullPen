'use client';

import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'bullpen-recently-viewed';
const MAX_ITEMS = 8;

export interface RecentlyViewedCompany {
  ticker: string;
  name: string;
  logo_url?: string | null;
  instrument_type?: string;
  viewedAt: number;
}

function loadFromStorage(): RecentlyViewedCompany[] {
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

function saveToStorage(items: RecentlyViewedCompany[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // ignore
  }
}

export function useRecentlyViewed() {
  const [items, setItems] = useState<RecentlyViewedCompany[]>([]);

  useEffect(() => {
    setItems(loadFromStorage());
  }, []);

  const add = useCallback((ticker: string, name: string, logo_url?: string | null, instrument_type?: string) => {
    const normalized = { ticker: ticker.toUpperCase(), name: name || ticker, logo_url: logo_url ?? null, instrument_type, viewedAt: Date.now() };
    setItems((prev) => {
      const filtered = prev.filter((p) => p.ticker !== normalized.ticker);
      const next = [normalized, ...filtered].slice(0, MAX_ITEMS);
      saveToStorage(next);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setItems([]);
    saveToStorage([]);
  }, []);

  return { items, add, clear };
}
