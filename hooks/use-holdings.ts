'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import {
  getMyHoldings,
  addHoldingAction,
  addOrUpdateHoldingAction,
  updateHoldingAction,
  removeHoldingAction,
  updateHoldingBySymbolAction,
  removeHoldingBySymbolAction,
  type AddHoldingInput,
  type UpdateHoldingInput,
} from '@/app/actions/holdings';
import type { UserHolding } from '@/lib/types/database';

/**
 * TanStack Query hook to fetch user holdings
 */
export function useHoldings() {
  const { user, isAuthenticated } = useAuth();

  return useQuery({
    queryKey: ['holdings', user?.id],
    queryFn: async (): Promise<UserHolding[]> => {
      if (!isAuthenticated || !user) {
        throw new Error('Authentication required');
      }

      const result = await getMyHoldings();

      if (result.success && result.holdings) {
        return result.holdings;
      }
      throw new Error(result.error || 'Failed to fetch holdings');
    },
    enabled: isAuthenticated && !!user,
    staleTime: 60 * 1000, // 1 minute — holdings change infrequently
    gcTime: 5 * 60 * 1000, // 5 minutes cache retention
  });
}

/**
 * TanStack Query mutation to add a holding
 */
export function useAddHolding() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: AddHoldingInput): Promise<UserHolding> => {
      if (!user?.id) {
        throw new Error('Authentication required');
      }

      const result = await addHoldingAction(user.id, input);

      if (result.success && result.holding) {
        return result.holding;
      }
      throw new Error(result.error || 'Failed to add holding');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['holdings', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['holdings-quotes'] });
    },
  });
}

/**
 * Add or update a holding — adds to existing quantity if symbol already in portfolio.
 * Use for AI-driven add (e.g. "add 5 NVIDIA" when user may already have it).
 */
export function useAddOrUpdateHolding() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: AddHoldingInput): Promise<UserHolding> => {
      if (!user?.id) throw new Error('Authentication required');

      const result = await addOrUpdateHoldingAction(user.id, input);
      if (result.success && result.holding) return result.holding;
      throw new Error(result.error || 'Failed to add holding');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['holdings', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['holdings-quotes'] });
    },
  });
}

/**
 * TanStack Query mutation to update a holding
 */
export function useUpdateHolding() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      holdingId,
      updates,
    }: {
      holdingId: string;
      updates: UpdateHoldingInput;
    }): Promise<UserHolding> => {
      if (!user?.id) {
        throw new Error('Authentication required');
      }

      const result = await updateHoldingAction(user.id, holdingId, updates);

      if (result.success && result.holding) {
        return result.holding;
      }
      throw new Error(result.error || 'Failed to update holding');
    },
    onSuccess: () => {
      // Invalidate holdings query to refetch
      queryClient.invalidateQueries({ queryKey: ['holdings', user?.id] });
      // Also invalidate quotes query
      queryClient.invalidateQueries({ queryKey: ['holdings-quotes'] });
    },
  });
}

/**
 * Update a holding by ticker symbol — for AI agent use.
 * Looks up the holding by symbol (user-scoped) then applies the update.
 */
export function useUpdateHoldingBySymbol() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      symbol,
      quantity,
      avg_price,
    }: {
      symbol: string;
      quantity?: number | null;
      avg_price?: number | null;
    }): Promise<UserHolding> => {
      if (!user?.id) throw new Error('Authentication required');
      const result = await updateHoldingBySymbolAction(user.id, symbol, { quantity, avg_price });
      if (result.success && result.holding) return result.holding;
      throw new Error(result.error || 'Failed to update holding');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['holdings', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['holdings-quotes'] });
    },
  });
}

/**
 * Remove a holding by ticker symbol — for AI agent use.
 * Verifies ownership server-side before deleting.
 */
export function useRemoveHoldingBySymbol() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (symbol: string): Promise<void> => {
      if (!user?.id) throw new Error('Authentication required');
      const result = await removeHoldingBySymbolAction(user.id, symbol);
      if (!result.success) throw new Error(result.error || 'Failed to remove holding');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['holdings', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['holdings-quotes'] });
    },
  });
}

/**
 * TanStack Query mutation to remove a holding
 */
export function useRemoveHolding() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (holdingId: string): Promise<void> => {
      if (!user?.id) {
        throw new Error('Authentication required');
      }

      const result = await removeHoldingAction(user.id, holdingId);

      if (!result.success) {
        throw new Error(result.error || 'Failed to remove holding');
      }
    },
    onSuccess: () => {
      // Invalidate holdings query to refetch
      queryClient.invalidateQueries({ queryKey: ['holdings', user?.id] });
      // Also invalidate quotes query
      queryClient.invalidateQueries({ queryKey: ['holdings-quotes'] });
    },
  });
}