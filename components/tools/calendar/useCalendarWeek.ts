'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type {
  EarningsItem,
  DividendItem,
  SplitItem,
  IPOItem,
  UnifiedEvent,
  CalendarResponse,
} from './types';

/**
 * Throws on any non-success response (HTTP-level or `{success:false}` in the
 * body — a 429 from this route's own rate limiter still returns 200-shaped
 * JSON on some paths) so TanStack Query's default retry/backoff actually
 * engages. The previous version resolved unconditionally on any JSON body,
 * so a rate-limited response silently rendered as "no events this month" —
 * indistinguishable from a genuinely quiet month — with nothing retrying and
 * nothing telling the user their request failed.
 */
async function fetchCalendar<T>(url: string): Promise<CalendarResponse<T>> {
  const res = await fetch(url);
  const body: CalendarResponse<T> = await res.json();
  if (!res.ok || !body.success) {
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return body;
}

/**
 * Fires all four calendar endpoints unconditionally (the grid needs every
 * type at once, unlike the old per-tab fetch-on-select behavior) and
 * normalizes the results into one flat, typed event list.
 */
export function useCalendarWeek(from: string, to: string) {
  const earningsQ = useQuery<CalendarResponse<EarningsItem>>({
    queryKey: ['calendar-earnings', from, to],
    queryFn: () => fetchCalendar<EarningsItem>(`/api/calendar/earnings?from=${from}&to=${to}`),
    staleTime: 60 * 60 * 1000,
  });
  const dividendsQ = useQuery<CalendarResponse<DividendItem>>({
    queryKey: ['calendar-dividends', from, to],
    queryFn: () => fetchCalendar<DividendItem>(`/api/calendar/dividends?from=${from}&to=${to}`),
    staleTime: 60 * 60 * 1000,
  });
  const splitsQ = useQuery<CalendarResponse<SplitItem>>({
    queryKey: ['calendar-splits', from, to],
    queryFn: () => fetchCalendar<SplitItem>(`/api/calendar/splits?from=${from}&to=${to}`),
    staleTime: 60 * 60 * 1000,
  });
  const ipoQ = useQuery<CalendarResponse<IPOItem>>({
    queryKey: ['calendar-ipo', from, to],
    queryFn: () => fetchCalendar<IPOItem>(`/api/calendar/ipo?from=${from}&to=${to}`),
    staleTime: 60 * 60 * 1000,
  });

  const events = useMemo<UnifiedEvent[]>(() => {
    const out: UnifiedEvent[] = [];
    for (const e of earningsQ.data?.data ?? []) {
      out.push({ type: 'earnings', symbol: e.symbol, name: e.name, date: e.date, marketCap: e.market_cap, raw: e });
    }
    for (const d of dividendsQ.data?.data ?? []) {
      out.push({ type: 'dividends', symbol: d.symbol, name: d.name, date: d.ex_dividend_date, marketCap: d.market_cap, raw: d });
    }
    for (const s of splitsQ.data?.data ?? []) {
      out.push({ type: 'splits', symbol: s.symbol, name: s.name, date: s.date, marketCap: s.market_cap, raw: s });
    }
    for (const i of ipoQ.data?.data ?? []) {
      out.push({ type: 'ipo', symbol: i.symbol, name: i.name, date: i.date, marketCap: i.market_cap, raw: i });
    }
    return out;
  }, [earningsQ.data, dividendsQ.data, splitsQ.data, ipoQ.data]);

  const isLoading = earningsQ.isLoading || dividendsQ.isLoading || splitsQ.isLoading || ipoQ.isLoading;

  return { events, isLoading };
}
