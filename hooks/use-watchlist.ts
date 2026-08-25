'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';

export interface WatchlistItem {
  id: string;
  symbol: string;
  company_name: string;
  alerts_enabled: boolean;
  added_at: string;
  list_id?: string | null;
  logo_url?: string | null;
}

export interface WatchlistList {
  id: string;
  name: string;
  color: string | null;
  position: number;
  created_at: string;
  item_count: number;
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

/** Add a symbol to the watchlist (optionally scoped to a specific list) */
export function useAddToWatchlist() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ symbol, company_name, listId }: { symbol: string; company_name: string; listId?: string }) => {
      const url = listId ? `/api/watchlist/lists/${listId}/items` : '/api/watchlist';
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, company_name }),
      });
      if (!res.ok) throw new Error('Failed to add to watchlist');
      return res.json();
    },
    onMutate: async ({ symbol, company_name, listId }) => {
      const symUp = symbol.toUpperCase();
      const optimistic: WatchlistItem = {
        id: `optimistic-${symUp}`,
        symbol: symUp,
        company_name,
        alerts_enabled: true,
        added_at: new Date().toISOString(),
        list_id: listId ?? null,
      };

      // Update the flat watchlist cache
      await queryClient.cancelQueries({ queryKey: ['watchlist'] });
      const previousAll = queryClient.getQueryData<WatchlistItem[]>(['watchlist']);
      queryClient.setQueryData<WatchlistItem[]>(['watchlist'], (old) => [optimistic, ...(old ?? [])]);

      // Also update the list-specific cache so the card appears immediately in list view
      let previousList: WatchlistItem[] | undefined;
      if (listId) {
        await queryClient.cancelQueries({ queryKey: ['watchlist-items', listId] });
        previousList = queryClient.getQueryData<WatchlistItem[]>(['watchlist-items', listId]);
        queryClient.setQueryData<WatchlistItem[]>(['watchlist-items', listId], (old) => [optimistic, ...(old ?? [])]);
      }

      return { previousAll, previousList, listId };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previousAll !== undefined) queryClient.setQueryData(['watchlist'], ctx.previousAll);
      if (ctx?.listId && ctx?.previousList !== undefined) {
        queryClient.setQueryData(['watchlist-items', ctx.listId], ctx.previousList);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['watchlist'] });
      queryClient.invalidateQueries({ queryKey: ['watchlist-items'] });
      queryClient.invalidateQueries({ queryKey: ['watchlist-sparklines'] });
      queryClient.invalidateQueries({ queryKey: ['watchlist-lists'] }); // refresh item_count badge
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
    mutationFn: async ({ symbol }: { symbol: string; listId?: string | null }) => {
      const res = await fetch(`/api/watchlist?symbol=${encodeURIComponent(symbol)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to remove from watchlist');
    },
    onMutate: async ({ symbol, listId }) => {
      const symUp = symbol.toUpperCase();

      // Remove from flat watchlist cache
      await queryClient.cancelQueries({ queryKey: ['watchlist'] });
      const previousAll = queryClient.getQueryData<WatchlistItem[]>(['watchlist']);
      queryClient.setQueryData<WatchlistItem[]>(['watchlist'], (old) =>
        (old ?? []).filter((item) => item.symbol !== symUp)
      );

      // Remove from list-specific cache so the card vanishes immediately in list view
      let previousList: WatchlistItem[] | undefined;
      if (listId) {
        await queryClient.cancelQueries({ queryKey: ['watchlist-items', listId] });
        previousList = queryClient.getQueryData<WatchlistItem[]>(['watchlist-items', listId]);
        queryClient.setQueryData<WatchlistItem[]>(['watchlist-items', listId], (old) =>
          (old ?? []).filter((item) => item.symbol !== symUp)
        );
      }

      return { previousAll, previousList, listId };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previousAll !== undefined) queryClient.setQueryData(['watchlist'], ctx.previousAll);
      if (ctx?.listId && ctx?.previousList !== undefined) {
        queryClient.setQueryData(['watchlist-items', ctx.listId], ctx.previousList);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['watchlist'] });
      queryClient.invalidateQueries({ queryKey: ['watchlist-items'] });
      queryClient.invalidateQueries({ queryKey: ['watchlist-sparklines'] });
      queryClient.invalidateQueries({ queryKey: ['watchlist-lists'] }); // refresh item_count badge
      queryClient.invalidateQueries({ queryKey: ['user-alerts'] }); // server removes alerts for unwatched symbol
    },
  });
}

/** Fetch all watchlist lists for the current user */
export function useWatchlistLists() {
  const { isAuthenticated } = useAuth();

  return useQuery({
    queryKey: ['watchlist-lists'],
    queryFn: async (): Promise<WatchlistList[]> => {
      const res = await fetch('/api/watchlist/lists');
      if (!res.ok) throw new Error('Failed to fetch watchlist lists');
      const data = await res.json();
      return data.lists ?? [];
    },
    enabled: isAuthenticated,
    staleTime: 60 * 1000,
  });
}

/** Fetch items in a specific watchlist list */
export function useWatchlistItems(listId: string | null) {
  const { isAuthenticated } = useAuth();

  return useQuery({
    queryKey: ['watchlist-items', listId],
    queryFn: async (): Promise<WatchlistItem[]> => {
      const res = await fetch(`/api/watchlist/lists/${listId}`);
      if (!res.ok) throw new Error('Failed to fetch list items');
      const data = await res.json();
      return data.items ?? [];
    },
    enabled: isAuthenticated && !!listId,
    staleTime: 60 * 1000,
  });
}

/** Create a new watchlist list */
export function useCreateWatchlistList() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ name, color }: { name: string; color?: string | null }) => {
      const res = await fetch('/api/watchlist/lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color }),
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error ?? 'Failed to create list', status: res.status };
      return { success: true, list: data.list };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watchlist-lists'] });
    },
  });
}

/** Rename or recolor a watchlist list */
export function useUpdateWatchlistList() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ listId, name, color }: { listId: string; name?: string; color?: string | null }) => {
      const res = await fetch(`/api/watchlist/lists/${listId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color }),
      });
      if (!res.ok) throw new Error('Failed to update list');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watchlist-lists'] });
    },
  });
}

/** Delete a watchlist list (cascades items) */
export function useDeleteWatchlistList() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (listId: string) => {
      const res = await fetch(`/api/watchlist/lists/${listId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete list');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watchlist-lists'] });
      queryClient.invalidateQueries({ queryKey: ['watchlist'] });
    },
  });
}
