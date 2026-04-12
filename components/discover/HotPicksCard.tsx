'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import { CompanyRowActions } from '@/components/discover/CompanyRowActions';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Flame } from 'lucide-react';
import { fetchWithTimeout } from '@/lib/utils';
import { HOT_PICKS_QUERY_KEY } from '@/lib/discover/hot-picks-query';

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
 * Hot Picks Card — tickers with the most stock detail page visits in the window.
 */
export function HotPicksCard() {
  const { data: hotPicks, isLoading } = useQuery<HotPick[]>({
    queryKey: HOT_PICKS_QUERY_KEY,
    queryFn: async () => {
      try {
        const response = await fetchWithTimeout(
          '/api/search/metrics?hours=168&limit=8',
          {},
          10000
        ); // Last 7 days, top 8
        const data: HotPicksResponse = await response.json();
        if (!data.success || !data.data?.length) return [];

      // Single batch request for company names/logos (replaces N individual /api/search calls)
      const tickers = data.data.map((pick) => pick.ticker);
      const batchRes = await fetch('/api/companies/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tickers }),
      });
      const batchData = (batchRes.ok
        ? await batchRes.json()
        : { data: [] }) as {
 data?: Array<{ ticker: string; name: string; logo_url: string | null }>;
      };
      const companyMap = new Map(
        (batchData.data || []).map((c) => [
          c.ticker,
          { name: c.name, logo_url: c.logo_url },
        ])
      );

        return data.data.map((pick) => ({
          ...pick,
          name: companyMap.get(pick.ticker)?.name || pick.ticker,
          logo_url: companyMap.get(pick.ticker)?.logo_url || null,
        }));
      } catch (e) {
        const err = e as Error;
        if (err?.name === 'AbortError' || err?.message === 'Failed to fetch') return [];
        throw e;
      }
    },
    staleTime: 30 * 1000, // refresh often; visits also invalidate from stock page
    refetchOnWindowFocus: true,
    retry: 1,
    gcTime: 30 * 60 * 1000, // 30 minutes
  });

  if (isLoading) {
    return (
      <Card className="border-border/50 min-w-0 overflow-hidden">
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

  const isEmpty = !hotPicks || hotPicks.length === 0;

  return (
    <Card className="border-border/50 min-w-0 overflow-hidden">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Flame className="h-5 w-5 text-orange-500" />
          Hot Picks
        </CardTitle>
        <CardDescription>
          Stocks others are opening most this week (by detail page visits).
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isEmpty ? (
          <p className="text-sm text-muted-foreground py-2">
            Nothing here yet — open a few company pages and this list will fill up automatically.
          </p>
        ) : (
        <div className="space-y-1">
          {hotPicks.map((pick, index) => (
            <div
              key={pick.ticker}
              className="group flex cursor-pointer items-center gap-3 p-2.5 -mx-2 rounded-lg transition-all duration-200 hover:bg-accent/50 hover:shadow-sm border border-transparent hover:border-border/50"
            >
              <Link
                href={`/stock/${pick.ticker}`}
                className="flex flex-1 min-w-0 items-center gap-3"
              >
                <div className="flex items-center justify-center w-7 text-xs font-bold text-muted-foreground tabular-nums shrink-0">
                  {index + 1}
                </div>
                <CompanyLogo
                  name={pick.name || pick.ticker}
                  ticker={pick.ticker}
                  logoUrl={pick.logo_url || null}
                  size={36}
                />
                <div className="flex-1 min-w-0">
                  <div className="font-extrabold text-foreground text-sm tabular-nums group-hover:underline">
                    {pick.ticker}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">{pick.name || pick.ticker}</div>
                </div>
                <div className="text-xs text-muted-foreground shrink-0">
                  {pick.click_count} {pick.click_count === 1 ? 'visit' : 'visits'}
                </div>
              </Link>
              <CompanyRowActions ticker={pick.ticker} name={pick.name || pick.ticker} className="shrink-0" />
            </div>
          ))}
        </div>
        )}
      </CardContent>
    </Card>
  );
}
