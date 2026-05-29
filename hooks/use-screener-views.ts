'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';

export interface ScreenerView {
  id: string;
  name: string;
  tickers: string[];
  position: number;
  created_at: string;
  updated_at: string;
}

export function useScreenerViews() {
  const { isAuthenticated } = useAuth();

  return useQuery({
    queryKey: ['screener-views'],
    queryFn: async (): Promise<ScreenerView[]> => {
      const res = await fetch('/api/screener/views');
      if (!res.ok) throw new Error('Failed to fetch screener views');
      const data = await res.json();
      return data.views ?? [];
    },
    enabled: isAuthenticated,
    staleTime: 60 * 1000,
  });
}

export function useCreateScreenerView() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ name, tickers }: { name: string; tickers: string[] }) => {
      const res = await fetch('/api/screener/views', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, tickers }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to create view');
      return data.view as ScreenerView;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['screener-views'] });
    },
  });
}

export function useUpdateScreenerView() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, name, tickers }: { id: string; name?: string; tickers?: string[] }) => {
      const res = await fetch(`/api/screener/views/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, tickers }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to update view');
      return data.view as ScreenerView;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['screener-views'] });
    },
  });
}

export function useDeleteScreenerView() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/screener/views/${id}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 204) throw new Error('Failed to delete view');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['screener-views'] });
    },
  });
}
