'use client';

import Link from 'next/link';
import { Separator } from '@/components/ui/separator';
import { CompanyRowActions } from '@/components/discover/CompanyRowActions';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { RecentFiling } from '@/hooks/use-discover';
import { slugToAssetPath } from '@/lib/assets/asset-type';

interface RecentFilingsListProps {
  filings: RecentFiling[] | undefined;
  isLoading: boolean;
}

export function RecentFilingsList({ filings, isLoading }: RecentFilingsListProps) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center justify-between gap-4 py-2">
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-48" />
            </div>
            <Skeleton className="h-5 w-16" />
          </div>
        ))}
      </div>
    );
  }

  if (!filings || filings.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No recent filings available.</p>
    );
  }

  const formatDateShort = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="space-y-0">
      {filings.map((item, index) => {
        const stockUrl = slugToAssetPath(item.company.ticker);

        return (
          <div key={item.filing.id}>
            {index > 0 && <Separator className="my-3 opacity-50" />}
            <div className="group flex cursor-pointer items-center justify-between gap-4 py-3.5 transition-all duration-200 hover:bg-accent/50 -mx-2 px-3 rounded-lg border border-transparent hover:border-border/50">
              <Link href={stockUrl} className="flex flex-1 min-w-0">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-extrabold text-foreground tabular-nums tracking-tight group-hover:text-primary transition-colors">
                      {item.company.ticker}
                    </span>
                    <span className="text-xs text-muted-foreground truncate">{item.company.name}</span>
                  </div>
                  <span className="text-xs text-muted-foreground font-medium">
                    {item.filing.filing_type} • {formatDateShort(item.filing.filing_date)}
                  </span>
                </div>
              </Link>
              <div className="flex items-center gap-2 flex-shrink-0">
                {item.insightsCount > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {item.insightsCount} {item.insightsCount === 1 ? 'insight' : 'insights'}
                  </span>
                )}
                <CompanyRowActions
                  ticker={item.company.ticker}
                  name={item.company.name}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
