'use client';

import { useEffect, useRef, useState } from 'react';

/** Floor reading pace while there is a backlog, in characters per second. */
const BASE_CPS = 110;
/** A backlog is cleared within roughly this long, however big the burst. */
const CATCH_UP_MS = 450;

/**
 * Streamed model text, released at a steady writing pace instead of in the
 * bursts it arrives in (Claude streams in chunks, and longer after a tool
 * call). Speeds up with the backlog, so a long burst never trails far behind
 * and the reply finishes promptly once the stream does. Cut at word
 * boundaries so half-words never flash.
 *
 * Text that was already complete when the component mounted (a past message,
 * a reopened conversation) shows in full immediately. Reduced motion: the
 * text as it arrives, unpaced.
 *
 * Returns the text to show and whether it is still catching up.
 */
export function useSmoothText(text: string, streaming: boolean): { visible: string; catchingUp: boolean } {
  const [reduced] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const [shown, setShown] = useState(() => (streaming ? 0 : text.length));
  const targetRef = useRef(text);
  useEffect(() => {
    targetRef.current = text;
  }, [text]);
  const running = !reduced && (streaming || shown < text.length);

  useEffect(() => {
    if (!running) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(64, now - last);
      last = now;
      setShown((s) => {
        const goal = targetRef.current.length;
        if (s >= goal) return s;
        const backlog = goal - s;
        const step = Math.max((BASE_CPS * dt) / 1000, (backlog * dt) / CATCH_UP_MS);
        return Math.min(goal, s + Math.max(1, Math.round(step)));
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running]);

  if (reduced || shown >= text.length) return { visible: text, catchingUp: false };
  // End on a word boundary: the last space at or before the reveal point.
  const cut = text.lastIndexOf(' ', shown);
  return { visible: text.slice(0, cut > 0 ? cut : shown), catchingUp: true };
}
