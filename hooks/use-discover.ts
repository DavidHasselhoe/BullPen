import { useQuery } from '@tanstack/react-query';
import { fetchWithTimeout } from '@/lib/utils';
import type { Company } from '@/lib/types/database';

const FETCH_TIMEOUT_MS = 10000;

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

interface RecentFilingsResponse {
  success: boolean;
  filings?: RecentFiling[];
  error?: string;
}

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
