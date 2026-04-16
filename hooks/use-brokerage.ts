'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface BrokerageConnection {
  id: string;
  user_id: string;
  snaptrade_account_id: string;
  authorization_id: string | null;
  account_name: string | null;
  brokerage_name: string | null;
  brokerage_slug: string | null;
  account_number: string | null;
  account_type: string | null;
  is_active: boolean;
  last_synced_at: string | null;
  created_at: string;
}

export interface BrokerageAccountsResponse {
  success: boolean;
  registered: boolean;
  configured: boolean;
  accounts: BrokerageConnection[];
  warning?: string;
}

export interface SyncResult {
  success: boolean;
  synced: number;
  accounts: number;
  message?: string;
  error?: string;
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

/** Fetch connected brokerage accounts and registration status. */
export function useBrokerageAccounts() {
  const { isAuthenticated } = useAuth();

  return useQuery<BrokerageAccountsResponse>({
    queryKey: ['brokerage-accounts'],
    queryFn: async () => {
      const res = await fetch('/api/brokerage/accounts');
      if (!res.ok) throw new Error('Failed to fetch brokerage accounts');
      return res.json();
    },
    enabled: isAuthenticated,
    staleTime: 60 * 1000, // 1 min
    retry: false,
  });
}

/** Open the SnapTrade broker-selection portal in a new tab. */
export function useBrokerageConnect() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/brokerage/connect', { method: 'POST' });
      const json = await res.json();
      if (!res.ok || !json.redirectURI) {
        throw new Error(json.error ?? 'Failed to generate connection link');
      }
      return json.redirectURI as string;
    },
    onSuccess: (redirectURI: string) => {
      // Open SnapTrade portal — the callback page will handle the return
      window.open(redirectURI, '_blank', 'noopener,noreferrer');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['brokerage-accounts'] });
    },
  });
}

/** Sync brokerage positions into user_holdings. */
export function useBrokerageSync() {
  const queryClient = useQueryClient();

  return useMutation<SyncResult>({
    mutationFn: async () => {
      const res = await fetch('/api/brokerage/sync', { method: 'POST' });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error ?? 'Sync failed');
      }
      return json as SyncResult;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['holdings'] });
      queryClient.invalidateQueries({ queryKey: ['holdings-quotes'] });
      queryClient.invalidateQueries({ queryKey: ['brokerage-accounts'] });
    },
  });
}

/** Disconnect a brokerage — remove all connections. */
export function useBrokerageDisconnect() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (authorizationId?: string) => {
      const res = await fetch('/api/brokerage/disconnect', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: authorizationId
          ? JSON.stringify({ authorizationId })
          : undefined,
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error ?? 'Disconnect failed');
      }
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brokerage-accounts'] });
      queryClient.invalidateQueries({ queryKey: ['holdings'] });
      queryClient.invalidateQueries({ queryKey: ['holdings-quotes'] });
    },
  });
}
