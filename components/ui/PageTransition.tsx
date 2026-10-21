'use client';

import { usePathname } from 'next/navigation';
import { useLayoutEffect, useRef, type ReactNode } from 'react';

/**
 * Applies the app's one page entrance animation (`.page-enter` in globals.css)
 * to whatever route is currently rendered, and replays it on every client-side
 * navigation.
 *
 * The replay is done by removing the class, forcing a reflow and re-adding it,
 * rather than by `key={pathname}` on the wrapper. A key would remount the whole
 * subtree on every navigation — including nested layouts that App Router is
 * meant to keep alive (the Academy XP bar, the tools shell), which would refetch
 * and re-animate on each step inside a section. Restarting the animation on a
 * stable node leaves the tree untouched.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const ref = useRef<HTMLDivElement>(null);
  const mounted = useRef(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Not on the first mount: the server HTML already played the entrance.
    // Replaying it at hydration faded the whole page back from opacity 0, and
    // Chrome counts the largest paint at the second fade, ~5s on a mid-range
    // phone (Lighthouse LCP render delay on /discover, 2026-10-21).
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    el.classList.remove('page-enter');
    void el.offsetWidth; // reflow — without it the re-added class is a no-op
    el.classList.add('page-enter');
  }, [pathname]);

  return (
    <div ref={ref} className="page-enter">
      {children}
    </div>
  );
}
