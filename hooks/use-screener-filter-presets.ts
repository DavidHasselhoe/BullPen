'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import type { ScreenerFilterValues } from '@/components/screener/ScreenerFilters';
import { canCreateSavedScreen, canUseScreenAlerts, type SavedScreenScope } from '@/lib/screener/saved-screen-limits';

/** A saved screen: a named filter set, plus (Pro) a daily new-match alert. */
export interface ScreenerFilterPreset {
  id: string;
  name: string;
  filters: Partial<ScreenerFilterValues>;
  position: number;
  scope: SavedScreenScope;
  alert_enabled: boolean;
  checked_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Thrown by the mutations; `code` is the API's error string ('upgrade_required' for a tier gate). */
export class PresetRequestError extends Error {
  constructor(public code: string) { super(code); }
}

async function readError(res: Response, fallback: string): Promise<PresetRequestError> {
  const data = await res.json().catch(() => ({}));
  return new PresetRequestError(typeof data.error === 'string' ? data.error : fallback);
}

const KEY = ['screener-filter-presets'];

export function useScreenerFilterPresets() {
  const { isAuthenticated } = useAuth();

  return useQuery({
    queryKey: KEY,
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

/** The same gates POST /api/screener/filter-presets and PATCH alert_enabled apply. */
export function useSavedScreenLimits() {
  const { user } = useAuth();
  const { data: presets } = useScreenerFilterPresets();
  const tier = user?.account_tier ?? null;
  const role = user?.role ?? null;
  const bonus = user?.pro_bonus_until ?? null;
  return {
    canCreate: canCreateSavedScreen(presets?.length ?? 0, tier, role, bonus),
    canAlert: canUseScreenAlerts(tier, role, bonus),
  };
}

export function useCreateScreenerFilterPreset() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ name, filters, scope }: { name: string; filters: Partial<ScreenerFilterValues>; scope: SavedScreenScope }) => {
      const res = await fetch('/api/screener/filter-presets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, filters, scope }),
      });
      if (!res.ok) throw await readError(res, 'save_failed');
      return (await res.json()).preset as ScreenerFilterPreset;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEY });
    },
  });
}

export function useUpdateScreenerFilterPreset() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...patch }: { id: string; alert_enabled?: boolean; name?: string }) => {
      const res = await fetch(`/api/screener/filter-presets/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw await readError(res, 'update_failed');
      return (await res.json()).preset as ScreenerFilterPreset;
    },
    onSuccess: (preset) => {
      queryClient.setQueryData<ScreenerFilterPreset[]>(KEY, (old) => old?.map((p) => (p.id === preset.id ? preset : p)));
    },
  });
}

export function useDeleteScreenerFilterPreset() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/screener/filter-presets/${id}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 204) throw await readError(res, 'delete_failed');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEY });
    },
  });
}
