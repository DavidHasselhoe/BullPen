'use client';

import { useState, useEffect, useRef } from 'react';
import type { TopMovers } from '@/lib/finnhub/finnhub-client';

/**
 * Consumes SSE stream from /api/market/movers/stream (Twelve Data WebSocket).
 * Uses WebSocket credits instead of API credits.
 * Falls back gracefully when stream returns 503 (not configured).
 */
export function useMoversStream(limit: number = 5): {
  data: TopMovers | null;
  isLoading: boolean;
  error: Error | null;
  isStreaming: boolean;
} {
  const [data, setData] = useState<TopMovers | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const hasDataRef = useRef(false);

  useEffect(() => {
    hasDataRef.current = false;
    let mounted = true;
    const url = `/api/market/movers/stream?limit=${limit}`;
    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.onopen = () => {
      if (mounted) {
        setIsStreaming(true);
      }
    };

    es.onmessage = (event) => {
      if (!mounted) return;
      try {
        const payload = JSON.parse(event.data);
        if (payload.error) {
          setError(new Error(payload.error));
          setIsStreaming(false);
          return;
        }
        if (payload.gainers && payload.losers) {
          hasDataRef.current = true;
          setData({
            gainers: payload.gainers.slice(0, limit),
            losers: payload.losers.slice(0, limit),
          });
          setIsLoading(false);
          setError(null);
        }
      } catch {
        // Ignore parse errors (e.g. ping comments)
      }
    };

    es.onerror = () => {
      if (mounted) {
        if (!hasDataRef.current) {
          setError(new Error('Stream unavailable'));
        }
        setIsStreaming(false);
        setIsLoading(false);
      }
    };

    return () => {
      mounted = false;
      es.close();
      eventSourceRef.current = null;
    };
  }, [limit]);

  return { data, isLoading, error, isStreaming };
}
