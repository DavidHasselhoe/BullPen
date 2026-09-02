'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import type { ScreenerFilterValues } from '@/components/screener/ScreenerFilters';

export interface ScreenerFilterPreset {
  id: string;
  name: string;
  filters: Partial<ScreenerFilterValues>;
  position: number;
  created_at: string;
  updated_at: string;
}

export function useScreenerFilterPresets() {
  const { isAuthenticated } = useAuth();

  return useQuery({
    queryKey: ['screener-filter-presets'],
    queryFn: async (): Promise<ScreenerFilterPreset[]> => {
      const res = await fetch('/api/screener/filter-presets');
      if (!res.ok) throw new Error('Failed to fetch screener filter presets');
      const data = await res.json();
      return data.presets ?? [];
    },
    enabled: isAuthenticated,
    staleTime: 60 * 1000,
  });
}

export function useCreateScreenerFilterPreset() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ name, filters }: { name: string; filters: Partial<ScreenerFilterValues> }) => {
      const res = await fetch('/api/screener/filter-presets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, filters }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to save filter preset');
      return data.preset as ScreenerFilterPreset;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['screener-filter-presets'] });
    },
  });
}

export function useDeleteScreenerFilterPreset() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/screener/filter-presets/${id}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 204) throw new Error('Failed to delete filter preset');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['screener-filter-presets'] });
    },
  });
}
