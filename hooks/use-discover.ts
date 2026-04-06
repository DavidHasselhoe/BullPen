import { useQuery } from '@tanstack/react-query';
import { fetchWithTimeout } from '@/lib/utils';
import type { Company, Trend, Signal } from '@/lib/types/database';

const FETCH_TIMEOUT_MS = 10000;

export interface FundamentalChange {
  type: 'trend' | 'signal';
  company: Company;
  trend?: Trend;
  signal?: Signal;
  direction: 'positive' | 'negative' | 'neutral';
  strength: number;
  description: string;
  context: string;
}

export interface RecentFiling {
  filing: {
    id: string;
    filing_type: string;
    filing_date: string;
    period_end_date: string | null;
  };
  company: Company;
  insightsCount: number;
}

export interface CompanyToWatch {
  company: Company;
  compositeScore: number | null;
  compositeDirection: 'bullish' | 'bearish' | 'neutral' | null;
  strongestTrend: {
    type: string;
    strength: number;
    direction: 'positive' | 'negative' | 'neutral';
  } | null;
  supportingLabel: string | null;
}

interface FundamentalChangesResponse {
  success: boolean;
  changes?: FundamentalChange[];
  error?: string;
}

interface RecentFilingsResponse {
  success: boolean;
  filings?: RecentFiling[];
  error?: string;
}

interface CompaniesToWatchResponse {
  success: boolean;
  companies?: CompanyToWatch[];
  error?: string;
}

/**
 * TanStack Query hook to fetch recent fundamental changes
 */
export function useFundamentalChanges(limit: number = 6) {
  return useQuery({
    queryKey: ['discover', 'fundamental-changes', limit],
    queryFn: async (): Promise<FundamentalChange[]> => {
      try {
        const response = await fetchWithTimeout(
          `/api/discover/fundamental-changes?limit=${limit}`,
          {},
          FETCH_TIMEOUT_MS
        );
        // Route may not exist (e.g. after SEC pipeline removal) — return empty gracefully
        if (!response.ok) return [];
        const data: FundamentalChangesResponse = await response.json();
        if (data.success && data.changes) return data.changes;
        return [];
      } catch (e) {
        const err = e as Error;
        if (err?.name === 'AbortError' || err?.message === 'Failed to fetch') return [];
        return []; // Never throw — empty state is fine
      }
    },
    staleTime: 60 * 1000,
    retry: false, // Don't retry a deleted/broken endpoint
  });
}

/**
 * TanStack Query hook to fetch recently analyzed filings
 */
export function useRecentFilings(limit: number = 10) {
  return useQuery({
    queryKey: ['discover', 'recent-filings', limit],
    queryFn: async (): Promise<RecentFiling[]> => {
      try {
        const response = await fetchWithTimeout(
          `/api/discover/recent-filings?limit=${limit}`,
          {},
          FETCH_TIMEOUT_MS
        );
        if (!response.ok) return [];
        const data: RecentFilingsResponse = await response.json();
        if (data.success && data.filings) return data.filings;
        return [];
      } catch {
        return [];
      }
    },
    staleTime: 60 * 1000,
    retry: false,
  });
}

/**
 * TanStack Query hook to fetch companies to watch
 */
export function useCompaniesToWatch(limit: number = 10) {
  return useQuery({
    queryKey: ['discover', 'companies-to-watch', limit],
    queryFn: async (): Promise<CompanyToWatch[]> => {
      try {
        const response = await fetchWithTimeout(
          `/api/discover/companies-to-watch?limit=${limit}`,
          {},
          FETCH_TIMEOUT_MS
        );
        if (!response.ok) return [];
        const data: CompaniesToWatchResponse = await response.json();
        if (data.success && data.companies) return data.companies;
        return [];
      } catch {
        return [];
      }
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}
