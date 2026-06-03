'use client';

import { useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { humanizeError } from '@/lib/errors/humanize';
import type { CreateAlertPayload, UserAlert } from '@/types/alerts';

export const ALERTS_QUERY_KEY = ['user-alerts'] as const;

interface AlertsResponse {
  success: boolean;
  alerts: UserAlert[];
}

export function useAlerts() {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery<AlertsResponse>({
    queryKey: ALERTS_QUERY_KEY,
    queryFn: async () => {
      const res = await fetch('/api/alerts');
      if (!res.ok) throw new Error('Failed to load alerts');
      return res.json();
    },
    enabled: isAuthenticated,
    staleTime: 30_000,
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const res = await fetch(`/api/alerts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive }),
      });
      if (!res.ok) throw new Error('Failed to update alert');
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ALERTS_QUERY_KEY }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/alerts/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete alert');
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ALERTS_QUERY_KEY }),
  });

  const create = useCallback(
    async (payload: CreateAlertPayload): Promise<{ ok: boolean; error?: string; code?: string }> => {
      try {
        const res = await fetch('/api/alerts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const body = await res.json();
        if (!res.ok) return { ok: false, error: body?.error || humanizeError(res.status), code: body?.code };
        await queryClient.invalidateQueries({ queryKey: ALERTS_QUERY_KEY });
        return { ok: true };
      } catch (err) {
        return { ok: false, error: humanizeError(err) };
      }
    },
    [queryClient]
  );

  const toggle = useCallback(
    async (id: string, isActive: boolean) => {
      await toggleMutation.mutateAsync({ id, isActive });
    },
    [toggleMutation]
  );

  const remove = useCallback(
    async (id: string) => {
      await deleteMutation.mutateAsync(id);
    },
    [deleteMutation]
  );

  const alerts = query.data?.alerts ?? [];
  const activeSymbolCount = new Set(alerts.filter((a) => a.isActive).map((a) => a.symbol)).size;

  return {
    alerts,
    activeSymbolCount,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    create,
    toggle,
    remove,
  };
}
