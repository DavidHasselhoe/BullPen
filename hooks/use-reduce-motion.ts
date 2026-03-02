'use client';

import { useState, useEffect } from 'react';

/**
 * Returns true when background animations should run.
 * Pauses when:
 * - Tab is hidden (Page Visibility API)
 * - User prefers reduced motion (accessibility)
 *
 * Use this in animated background components to save GPU/CPU when not visible.
 */
export function useShouldAnimateBackground(): boolean {
  const [shouldAnimate, setShouldAnimate] = useState(true);

  useEffect(() => {
    function update() {
      const hidden = typeof document !== 'undefined' && document.hidden;
      const reducedMotion =
        typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      setShouldAnimate(!hidden && !reducedMotion);
    }

    update();
    document.addEventListener('visibilitychange', update);
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    mq.addEventListener('change', update);
    return () => {
      document.removeEventListener('visibilitychange', update);
      mq.removeEventListener('change', update);
    };
  }, []);

  return shouldAnimate;
}
