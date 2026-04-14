import { useState, useEffect, useRef } from 'react';

/**
 * Returns a throttled version of `value` that updates at most once every `intervalMs`.
 *
 * - The first value is applied immediately.
 * - Subsequent changes within the window are held and applied once the window expires.
 * - Always applies the *latest* value when the pending timer fires.
 */
export function useThrottle<T>(value: T, intervalMs: number): T {
  const [throttled, setThrottled] = useState<T>(value);

  // Keep a ref to the latest value so the scheduled callback always uses it,
  // avoiding stale-closure issues.
  const latestValue = useRef<T>(value);
  const lastFired = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  latestValue.current = value;

  useEffect(() => {
    const fire = () => {
      lastFired.current = Date.now();
      timerRef.current = null;
      setThrottled(latestValue.current);
    };

    const elapsed = Date.now() - lastFired.current;

    if (elapsed >= intervalMs) {
      // Window has passed — apply immediately and cancel any pending flush.
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      fire();
    } else if (!timerRef.current) {
      // Within the window and no timer yet — schedule a flush at the end of the window.
      timerRef.current = setTimeout(fire, intervalMs - elapsed);
    }
    // If a timer is already scheduled, leave it — it will fire with latestValue.current.
  }, [value, intervalMs]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return throttled;
}
