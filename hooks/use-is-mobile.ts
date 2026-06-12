'use client';

import { useSyncExternalStore } from 'react';

// Matches Tailwind's `md` breakpoint (mobile = below 768px).
const QUERY = '(max-width: 767px)';

function subscribe(callback: () => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mql = window.matchMedia(QUERY);
  mql.addEventListener('change', callback);
  return () => mql.removeEventListener('change', callback);
}

function getSnapshot(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(QUERY).matches;
}

function getServerSnapshot(): boolean {
  return false;
}

/**
 * SSR-safe viewport check. Uses `useSyncExternalStore` (no setState-in-effect),
 * so it satisfies the project's `react-hooks/set-state-in-effect` rule.
 * Prefer Tailwind responsive classes; reach for this only when rendering must
 * branch in JS (e.g. a fixed panel width).
 */
export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
