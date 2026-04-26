'use client';

import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import { useLivePrices } from '@/hooks/use-live-prices';
import { cn } from '@/lib/utils';
import type { CompetitorEntry } from '@/app/api/stock/[ticker]/competitors/route';

interface CompetitorsResponse {
  competitors: CompetitorEntry[];
}

export function CompetitorsCard({ ticker }: { ticker: string }) {
  const router = useRouter();

  const { data, isLoading } = useQuery<CompetitorsResponse>({
    queryKey: ['stock-competitors', ticker],
    queryFn: () => fetch(`/api/stock/${ticker}/competitors`).then((r) => r.json()),
    staleTime: 24 * 60 * 60 * 1000,
    retry: 1,
  });

  const competitors = (data?.competitors ?? []).slice(0, 3);
  const livePrices  = useLivePrices(competitors.map((c) => c.ticker));

  if (isLoading) {
    return (
      <Card className="mb-8">
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-28" />
        </CardHeader>
        <CardContent className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Skeleton className="h-9 w-9 rounded-full" />
                <div className="space-y-1">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-3 w-12" />
                </div>
              </div>
              <Skeleton className="h-8 w-16" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (!competitors.length) return null;

  return (
    <Card className="mb-8">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">Competitors</CardTitle>
      </CardHeader>
      <CardContent className="divide-y divide-border -mx-6 px-0">
        {competitors.map((c) => {
          const live = livePrices.get(c.ticker);
          const up   = (live?.changePercent ?? 0) > 0;
          const down = (live?.changePercent ?? 0) < 0;
          return (
            <button
              key={c.ticker}
              onClick={() => router.push(`/stock/${c.ticker}`)}
              className="flex w-full items-center justify-between gap-3 px-6 py-3 text-left transition-colors hover:bg-accent/50"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <CompanyLogo
                  name={c.name}
                  ticker={c.ticker}
                  logoUrl={c.logoUrl}
                  size={36}
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{c.name}</p>
                  <Badge variant="outline" className="mt-0.5 h-4 px-1 font-mono text-xs">
                    {c.ticker}
                  </Badge>
                </div>
              </div>
              <div className="shrink-0 text-right">
                {live ? (
                  <>
                    <p className="text-sm font-semibold tabular-nums text-foreground">
                      ${live.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                    <p className={cn(
                      'text-xs tabular-nums',
                      up   && 'text-emerald-500',
                      down && 'text-red-500',
                      !up && !down && 'text-muted-foreground',
                    )}>
                      {up ? '+' : ''}{(live.changePercent ?? 0).toFixed(2)}%
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">—</p>
                )}
              </div>
            </button>
          );
        })}
      </CardContent>
    </Card>
  );
}
