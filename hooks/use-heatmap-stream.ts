'use client';

import { useEffect, useRef, useState } from 'react';
import type { HeatmapPriceEntry, Session } from '@/app/api/market/heatmap/stream/route';

export type { HeatmapPriceEntry, Session };

interface HeatmapStreamState {
  prices: Map<string, HeatmapPriceEntry>;
  session: Session;
  connected: boolean;
}

/**
 * Subscribe to the real-time heatmap price stream via SSE.
 * Merges incoming price maps into a stable Map reference.
 * Reconnects with a 3s delay on error.
 */
export function useHeatmapStream(): HeatmapStreamState {
  const [prices, setPrices] = useState<Map<string, HeatmapPriceEntry>>(new Map());
  const [session, setSession] = useState<Session>('closed');
  const [connected, setConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;

    function connect() {
      if (cancelled) return;
      const es = new EventSource('/api/market/heatmap/stream');

      es.onopen = () => {
        if (!cancelled) setConnected(true);
      };

      es.onmessage = (e) => {
        if (cancelled) return;
        try {
          const payload = JSON.parse(e.data) as {
            prices: Record<string, HeatmapPriceEntry>;
            session: Session;
            ts: number;
          };
          if (!payload?.prices) return;

          setSession(payload.session ?? 'closed');
          setPrices((prev) => {
            const next = new Map(prev);
            for (const [sym, entry] of Object.entries(payload.prices)) {
              next.set(sym, entry);
            }
            return next;
          });

          if (!connected) setConnected(true);
        } catch {
          // ignore malformed frames
        }
      };

      es.onerror = () => {
        if (cancelled) return;
        setConnected(false);
        es.close();
        esRef.current = null;
        // Reconnect after 3s
        reconnectTimerRef.current = setTimeout(() => {
          if (!cancelled) connect();
        }, 3_000);
      };

      esRef.current = es;
    }

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      esRef.current?.close();
      esRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { prices, session, connected };
}
