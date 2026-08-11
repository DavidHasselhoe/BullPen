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
  EventType,
} from './types';

/**
 * Throws on any non-success response (HTTP-level or `{success:false}` in the
 * body — a 429 from this route's own rate limiter still returns 200-shaped
 * JSON on some paths) so TanStack Query's default retry/backoff actually
 * engages. Resolving unconditionally would render a rate-limited response as
 * "no events", indistinguishable from a genuinely quiet range.
 */
async function fetchCalendar<T>(url: string): Promise<CalendarResponse<T>> {
  const res = await fetch(url);
  const body: CalendarResponse<T> = await res.json();
  if (!res.ok || !body.success) {
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return body;
}

/** Poll interval while the server is still filling days in the background. */
const PARTIAL_REFETCH_MS = 1500;

/**
 * Fires all four calendar endpoints for a date range and normalizes them into
 * one flat event list.
 *
 * Ranges outside the pre-warmed window come back `partial: true` with some
 * days unfilled — the server fills a bounded number per request to stay inside
 * the credit budget. When that happens this polls until it converges, so a
 * user paging back to an old month sees it fill in rather than sit empty.
 */
export function useCalendarEvents(from: string, to: string) {
  const common = {
    staleTime: 60 * 60 * 1000,
    // `partial` is only ever set by the server, so the refetch stops on its own
    // as soon as every day in the range is filled.
    refetchInterval: (q: { state: { data?: CalendarResponse<unknown> } }) =>
      q.state.data?.partial ? PARTIAL_REFETCH_MS : false,
  } as const;

  const earningsQ = useQuery<CalendarResponse<EarningsItem>>({
    queryKey: ['calendar-earnings', from, to],
    queryFn: () => fetchCalendar<EarningsItem>(`/api/calendar/earnings?from=${from}&to=${to}`),
    ...common,
  });
  const dividendsQ = useQuery<CalendarResponse<DividendItem>>({
    queryKey: ['calendar-dividends', from, to],
    queryFn: () => fetchCalendar<DividendItem>(`/api/calendar/dividends?from=${from}&to=${to}`),
    ...common,
  });
  const splitsQ = useQuery<CalendarResponse<SplitItem>>({
    queryKey: ['calendar-splits', from, to],
    queryFn: () => fetchCalendar<SplitItem>(`/api/calendar/splits?from=${from}&to=${to}`),
    ...common,
  });
  const ipoQ = useQuery<CalendarResponse<IPOItem>>({
    queryKey: ['calendar-ipo', from, to],
    queryFn: () => fetchCalendar<IPOItem>(`/api/calendar/ipo?from=${from}&to=${to}`),
    ...common,
  });

  const events = useMemo<UnifiedEvent[]>(() => {
    const out: UnifiedEvent[] = [];
    for (const e of earningsQ.data?.data ?? []) {
      out.push({ type: 'earnings', symbol: e.symbol, name: e.name, date: e.date, marketCap: e.market_cap, logoUrl: e.logo_url, raw: e });
    }
    for (const d of dividendsQ.data?.data ?? []) {
      out.push({ type: 'dividends', symbol: d.symbol, name: d.name, date: d.ex_dividend_date, marketCap: d.market_cap, logoUrl: d.logo_url, raw: d });
    }
    for (const s of splitsQ.data?.data ?? []) {
      out.push({ type: 'splits', symbol: s.symbol, name: s.name, date: s.date, marketCap: s.market_cap, logoUrl: s.logo_url, raw: s });
    }
    for (const i of ipoQ.data?.data ?? []) {
      out.push({ type: 'ipo', symbol: i.symbol, name: i.name, date: i.date, marketCap: i.market_cap, logoUrl: i.logo_url, raw: i });
    }
    return out;
  }, [earningsQ.data, dividendsQ.data, splitsQ.data, ipoQ.data]);

  /**
   * Per-type, per-date true totals — the server caps how many rows it returns
   * per day, so counting `events` would understate a busy day. Summed across
   * types into one lookup the day model can use directly.
   */
  const dayTotals = useMemo<Record<string, Partial<Record<EventType, number>>>>(() => {
    const out: Record<string, Partial<Record<EventType, number>>> = {};
    const add = (type: EventType, totals?: Record<string, number>) => {
      for (const [date, n] of Object.entries(totals ?? {})) {
        (out[date] ??= {})[type] = n;
      }
    };
    add('earnings', earningsQ.data?.day_totals);
    add('dividends', dividendsQ.data?.day_totals);
    add('splits', splitsQ.data?.day_totals);
    add('ipo', ipoQ.data?.day_totals);
    return out;
  }, [earningsQ.data, dividendsQ.data, splitsQ.data, ipoQ.data]);

  const isLoading = earningsQ.isLoading || dividendsQ.isLoading || splitsQ.isLoading || ipoQ.isLoading;
  const isPartial = Boolean(
    earningsQ.data?.partial || dividendsQ.data?.partial || splitsQ.data?.partial || ipoQ.data?.partial
  );
  const error = earningsQ.error ?? dividendsQ.error ?? splitsQ.error ?? ipoQ.error ?? null;

  return { events, dayTotals, isLoading, isPartial, error };
}
