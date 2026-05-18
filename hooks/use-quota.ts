'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import type { QuotaFeature, QuotaState } from '@/lib/billing/quotas';

const QUOTA_KEY = (feature: QuotaFeature) => ['quota', feature];

export interface QuotaResponse extends QuotaState {
  feature: QuotaFeature;
}

/**
 * Fetch the current quota state for a feature. Returns `undefined` while loading
 * and for unauthenticated users (where quotas don't apply).
 */
export function useQuota(feature: QuotaFeature) {
  const { isAuthenticated } = useAuth();
  return useQuery<QuotaResponse>({
    queryKey: QUOTA_KEY(feature),
    queryFn: async () => {
      const res = await fetch(`/api/billing/quota?feature=${feature}`);
      if (!res.ok) throw new Error(`Quota fetch failed: ${res.status}`);
      return res.json();
    },
    enabled: isAuthenticated,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}

/**
 * Call after a successful AI request so the indicator refreshes immediately.
 * (The server already incremented; the client just needs to re-read.)
 */
export function useInvalidateQuota() {
  const qc = useQueryClient();
  return (feature: QuotaFeature) => qc.invalidateQueries({ queryKey: QUOTA_KEY(feature) });
}
