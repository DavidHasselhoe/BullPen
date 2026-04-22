'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';

export interface WatchlistItem {
  id: string;
  symbol: string;
  company_name: string;
  alerts_enabled: boolean;
  added_at: string;
}

/** Fetch the current user's watchlist */
export function useWatchlist() {
  const { isAuthenticated } = useAuth();

  return useQuery({
    queryKey: ['watchlist'],
    queryFn: async (): Promise<WatchlistItem[]> => {
      const res = await fetch('/api/watchlist');
      if (!res.ok) throw new Error('Failed to fetch watchlist');
      const data = await res.json();
      return data.watchlist ?? [];
    },
    enabled: isAuthenticated,
    staleTime: 60 * 1000,
  });
}

/** Returns true if a symbol is in the watchlist */
export function useIsWatched(symbol: string) {
  const { data } = useWatchlist();
  return (data ?? []).some((item) => item.symbol === symbol.toUpperCase());
}

/** Add a symbol to the watchlist */
export function useAddToWatchlist() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ symbol, company_name }: { symbol: string; company_name: string }) => {
      const res = await fetch('/api/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, company_name }),
      });
      if (!res.ok) throw new Error('Failed to add to watchlist');
      return res.json();
    },
    onMutate: async ({ symbol, company_name }) => {
      await queryClient.cancelQueries({ queryKey: ['watchlist'] });
      const previous = queryClient.getQueryData<WatchlistItem[]>(['watchlist']);
      queryClient.setQueryData<WatchlistItem[]>(['watchlist'], (old) => [
        { id: `optimistic-${symbol}`, symbol: symbol.toUpperCase(), company_name, alerts_enabled: true, added_at: new Date().toISOString() },
        ...(old ?? []),
      ]);
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      queryClient.setQueryData(['watchlist'], ctx?.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['watchlist'] });
    },
  });
}

/** Toggle alerts_enabled for a symbol in the watchlist */
export function useToggleWatchlistAlert() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ symbol, alerts_enabled }: { symbol: string; alerts_enabled: boolean }) => {
      const res = await fetch('/api/watchlist', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, alerts_enabled }),
      });
      if (!res.ok) throw new Error('Failed to update alert setting');
      return res.json();
    },
    onMutate: async ({ symbol, alerts_enabled }) => {
      await queryClient.cancelQueries({ queryKey: ['watchlist'] });
      const previous = queryClient.getQueryData<WatchlistItem[]>(['watchlist']);
      queryClient.setQueryData<WatchlistItem[]>(['watchlist'], (old) =>
        (old ?? []).map((item) =>
          item.symbol === symbol.toUpperCase() ? { ...item, alerts_enabled } : item
        )
      );
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      queryClient.setQueryData(['watchlist'], ctx?.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['watchlist'] });
    },
  });
}

/** Remove a symbol from the watchlist */
export function useRemoveFromWatchlist() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (symbol: string) => {
      const res = await fetch(`/api/watchlist?symbol=${encodeURIComponent(symbol)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to remove from watchlist');
    },
    onMutate: async (symbol) => {
      await queryClient.cancelQueries({ queryKey: ['watchlist'] });
      const previous = queryClient.getQueryData<WatchlistItem[]>(['watchlist']);
      queryClient.setQueryData<WatchlistItem[]>(['watchlist'], (old) =>
        (old ?? []).filter((item) => item.symbol !== symbol.toUpperCase())
      );
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      queryClient.setQueryData(['watchlist'], ctx?.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['watchlist'] });
    },
  });
}
