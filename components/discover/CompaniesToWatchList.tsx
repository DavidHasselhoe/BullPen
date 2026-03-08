'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import { CompanyRowActions } from '@/components/discover/CompanyRowActions';
import type { CompanyToWatch } from '@/hooks/use-discover';

interface CompaniesToWatchListProps {
  companies: CompanyToWatch[] | undefined;
  isLoading: boolean;
}

export function CompaniesToWatchList({ companies, isLoading }: CompaniesToWatchListProps) {
  const getScoreBadgeConfig = (
    score: number | null,
    direction: 'bullish' | 'bearish' | 'neutral' | null
  ) => {
    if (score === null) {
      return {
        label: 'No recent signals',
        className: 'bg-muted text-muted-foreground border-border',
      };
    }

    if (direction === 'bullish' || score >= 60) {
      return {
        label: 'Bullish',
        className:
          'bg-green-500/10 text-green-700 border-green-500/30 dark:bg-green-500/15 dark:text-green-400 dark:border-green-500/40',
      };
    } else if (direction === 'bearish' || score < 40) {
      return {
        label: 'Bearish',
        className:
          'bg-red-500/10 text-red-700 border-red-500/30 dark:bg-red-500/15 dark:text-red-400 dark:border-red-500/40',
      };
    } else {
      return {
        label: 'Neutral',
        className: 'bg-muted text-muted-foreground border-border',
      };
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center justify-between gap-4 py-2">
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-48" />
            </div>
            <Skeleton className="h-5 w-20" />
          </div>
        ))}
      </div>
    );
  }

  if (!companies || companies.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No companies to watch at this time.</p>
    );
  }

  return (
    <div className="space-y-0">
      {companies.map((item, index) => {
        const stockUrl = `/stock/${item.company.ticker}`;
        const badgeConfig = getScoreBadgeConfig(item.compositeScore, item.compositeDirection);

        return (
          <div key={item.company.id}>
            {index > 0 && <Separator className="my-3 opacity-50" />}
            <div className="group flex cursor-pointer items-center justify-between gap-4 py-3.5 transition-all duration-200 hover:bg-accent/50 -mx-2 px-3 rounded-lg border border-transparent hover:border-border/50">
              <Link href={stockUrl} className="flex flex-1 min-w-0 items-center gap-3">
                <CompanyLogo
                  name={item.company.name}
                  ticker={item.company.ticker}
                  logoUrl={item.company.logo_url || null}
                  size={36}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-extrabold text-foreground tabular-nums tracking-tight group-hover:text-primary transition-colors">
                      {item.company.ticker}
                    </span>
                    <span className="text-xs text-muted-foreground truncate">{item.company.name}</span>
                  </div>
                  {item.supportingLabel && (
                    <p className="text-sm text-muted-foreground">{item.supportingLabel}</p>
                  )}
                </div>
              </Link>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Badge variant="outline" className={cn('text-xs', badgeConfig.className)}>
                  {badgeConfig.label}
                </Badge>
                {item.compositeScore !== null && (
                  <span className="text-xs text-muted-foreground w-10 text-right tabular-nums">
                    {item.compositeScore.toFixed(0)}
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
