'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Flame } from 'lucide-react';

interface HotPick {
  ticker: string;
  click_count: number;
  last_clicked_at: string;
  name?: string;
  logo_url?: string | null;
}

interface HotPicksResponse {
  success: boolean;
  data?: HotPick[];
  error?: string;
}

/**
 * Hot Picks Card Component
 * Displays most searched stocks based on search metrics
 */
export function HotPicksCard() {
  const { data: hotPicks, isLoading } = useQuery<HotPick[]>({
    queryKey: ['hot-picks'],
    queryFn: async () => {
      const response = await fetch('/api/search/metrics?hours=168&limit=8'); // Last 7 days, top 8
      const data: HotPicksResponse = await response.json();

      if (!data.success || !data.data) {
        return [];
      }

      // Fetch company names and logos for the hot picks
      // Use the first ticker as a search query to get company data
      // We'll fetch them individually to get proper results
      const tickers = data.data.map((pick) => pick.ticker);
      
      // Fetch company data from companies table via multiple requests
      const companyPromises = tickers.map(async (ticker) => {
        try {
          const response = await fetch(`/api/search?q=${ticker}&limit=1`);
          const result = await response.json();
          if (result.success && result.results && result.results.length > 0) {
            const company = result.results[0];
            return { ticker, name: company.name, logo_url: company.logo_url };
          }
        } catch (error) {
          console.error(`Error fetching company data for ${ticker}:`, error);
        }
        return { ticker, name: null, logo_url: null };
      });

      const companyData = await Promise.all(companyPromises);
      const companyMap = new Map(
        companyData.map((c) => [c.ticker, { name: c.name, logo_url: c.logo_url }])
      );

      return data.data.map((pick) => ({
        ...pick,
        name: companyMap.get(pick.ticker)?.name || pick.ticker,
        logo_url: companyMap.get(pick.ticker)?.logo_url || null,
      }));
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Flame className="h-5 w-5 text-orange-500" />
            Hot Picks
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded" />
                <div className="flex-1">
                  <Skeleton className="h-4 w-24 mb-2" />
                  <Skeleton className="h-3 w-16" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!hotPicks || hotPicks.length === 0) {
    return null; // Don't show card if no hot picks
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Flame className="h-5 w-5 text-orange-500" />
          Hot Picks
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {hotPicks.map((pick, index) => (
            <Link
              key={pick.ticker}
              href={`/stock/${pick.ticker}`}
              className="flex items-center gap-3 p-2 rounded-lg transition-colors hover:bg-accent group"
            >
              <div className="flex items-center justify-center w-8 text-sm font-bold text-muted-foreground">
                {index + 1}
              </div>
              <CompanyLogo
                name={pick.name || pick.ticker}
                ticker={pick.ticker}
                logoUrl={pick.logo_url || null}
                size={40}
              />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-foreground group-hover:underline">
                  {pick.name || pick.ticker}
                </div>
                <div className="text-sm text-muted-foreground">{pick.ticker}</div>
              </div>
              <div className="text-xs text-muted-foreground">
                {pick.click_count} {pick.click_count === 1 ? 'search' : 'searches'}
              </div>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
