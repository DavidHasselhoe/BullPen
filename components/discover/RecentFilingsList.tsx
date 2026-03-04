'use client';

import Link from 'next/link';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { RecentFiling } from '@/hooks/use-discover';

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
        const stockUrl = `/stock/${item.company.ticker}`;

        return (
          <div key={item.filing.id}>
            {index > 0 && <Separator className="my-3 opacity-50" />}
            <Link
              href={stockUrl}
              className="flex cursor-pointer items-center justify-between gap-4 py-3 transition-colors hover:bg-accent/30 -mx-2 px-2 rounded-md group"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-bold text-foreground tabular-nums group-hover:underline">
                    {item.company.ticker}
                  </span>
                  <span className="text-xs text-muted-foreground truncate">{item.company.name}</span>
                </div>
                <span className="text-xs text-muted-foreground font-medium">
                  {item.filing.filing_type} • {formatDateShort(item.filing.filing_date)}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {item.insightsCount > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {item.insightsCount} {item.insightsCount === 1 ? 'insight' : 'insights'}
                  </span>
                )}
              </div>
            </Link>
          </div>
        );
      })}
    </div>
  );
}
