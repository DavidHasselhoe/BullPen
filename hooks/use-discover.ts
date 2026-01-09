import { useQuery } from '@tanstack/react-query';
import type { Company, Trend, Signal } from '@/lib/types/database';

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
      const response = await fetch(`/api/discover/fundamental-changes?limit=${limit}`);
      const data: FundamentalChangesResponse = await response.json();

      if (data.success && data.changes) {
        return data.changes;
      }
      throw new Error(data.error || 'Failed to fetch fundamental changes');
    },
    staleTime: 60 * 1000, // 1 minute
  });
}

/**
 * TanStack Query hook to fetch recently analyzed filings
 */
export function useRecentFilings(limit: number = 10) {
  return useQuery({
    queryKey: ['discover', 'recent-filings', limit],
    queryFn: async (): Promise<RecentFiling[]> => {
      const response = await fetch(`/api/discover/recent-filings?limit=${limit}`);
      const data: RecentFilingsResponse = await response.json();

      if (data.success && data.filings) {
        return data.filings;
      }
      throw new Error(data.error || 'Failed to fetch recent filings');
    },
    staleTime: 60 * 1000, // 1 minute
  });
}

/**
 * TanStack Query hook to fetch companies to watch
 */
export function useCompaniesToWatch(limit: number = 10) {
  return useQuery({
    queryKey: ['discover', 'companies-to-watch', limit],
    queryFn: async (): Promise<CompanyToWatch[]> => {
      const response = await fetch(`/api/discover/companies-to-watch?limit=${limit}`);
      const data: CompaniesToWatchResponse = await response.json();

      if (data.success && data.companies) {
        return data.companies;
      }
      throw new Error(data.error || 'Failed to fetch companies to watch');
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
