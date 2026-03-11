'use client';

import { useState, useEffect, useRef } from 'react';

/**
 * Produces a smooth typewriter effect for streaming AI responses.
 *
 * While `isActive` is true the returned string gradually catches up to
 * `targetText` at a controlled pace:
 *   - Small lag (≤ 40 chars behind) → ~5 chars per frame  (~300 chars/s at 60fps)
 *   - Large lag (> 40 chars behind) → ~20 chars per frame (fast catch-up)
 *
 * When `isActive` becomes false the full `targetText` is returned immediately,
 * so completed messages render instantly without delay.
 */
export function useTypingEffect(targetText: string, isActive: boolean): string {
  const [displayedLength, setDisplayedLength] = useState(() =>
    isActive ? 0 : targetText.length
  );

  const targetRef = useRef(targetText);
  const displayedLengthRef = useRef(isActive ? 0 : targetText.length);
  const rafRef = useRef<number | null>(null);

  // Keep target ref in sync on every render (no dependency needed in RAF)
  targetRef.current = targetText;

  useEffect(() => {
    if (!isActive) {
      // Streaming finished – show everything at once
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      displayedLengthRef.current = targetText.length;
      setDisplayedLength(targetText.length);
      return;
    }

    const tick = () => {
      const targetLen = targetRef.current.length;
      const current = displayedLengthRef.current;

      if (current < targetLen) {
        const lag = targetLen - current;
        const step = lag > 40 ? 20 : 5;
        const next = Math.min(current + step, targetLen);
        displayedLengthRef.current = next;
        setDisplayedLength(next);
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [isActive]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isActive) return targetText;
  return targetText.slice(0, displayedLength);
}
