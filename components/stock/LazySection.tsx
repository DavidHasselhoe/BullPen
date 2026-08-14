'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

interface LazySectionProps {
  children: ReactNode;
  /** Placeholder height while unmounted, reserves space so the page doesn't jump. */
  minHeight?: number;
  /** How far ahead of the viewport to start mounting. */
  rootMargin?: string;
}

/**
 * Defers mounting (and therefore fetching) a section until it's about to
 * scroll into view. Stock-page sections below the header/chart/health-score
 * fold (financials, insider transactions, earnings calendar, etc.) fire real
 * TwelveData credit spend on mount — a user who rapidly clicks through many
 * tickers without ever scrolling shouldn't pay for data they never see.
 */
export function LazySection({ children, minHeight = 200, rootMargin = '100px 0px' }: LazySectionProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (visible) return;
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [visible, rootMargin]);

  if (visible) return <>{children}</>;
  return <div ref={ref} className="mb-8 animate-shimmer rounded-2xl" style={{ height: minHeight }} aria-hidden="true" />;
}
