'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Tints its text Signal Emerald when `value` rises and Signal Red when it
 * falls, then fades back to the normal text color. Nothing on mount or on an
 * unchanged tick, and nothing at all under prefers-reduced-motion. Color only,
 * and the end keyframe is left implicit so the fade lands on whatever color
 * the cell already has.
 */
export function PriceFlash({ value, children }: { value: number | null | undefined; children: ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(value);

  useEffect(() => {
    const before = prev.current;
    prev.current = value;
    const el = ref.current;
    if (!el || before == null || value == null || value === before) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const color = value > before ? 'var(--gain)' : 'var(--loss)';
    // A tick inside the last flash restarts it rather than stacking a second one.
    el.getAnimations().forEach((a) => a.cancel());
    // Holds the color for ~200ms so it registers, then fades over ~300ms.
    el.animate([{ color, offset: 0 }, { color, offset: 0.4 }], { duration: 500, easing: 'ease-out' });
  }, [value]);

  return <span ref={ref}>{children}</span>;
}
