'use client';

import Link from 'next/link';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import { useRecentlyViewed } from '@/hooks/use-recently-viewed';
import { History } from 'lucide-react';

/**
 * Compact recently viewed list - placed under search bar.
 * Shows ticker chips with logo fallback (ticker badge when logo unavailable).
 */
export function RecentlyViewedInline() {
  const { items } = useRecentlyViewed();

  if (items.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <History className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Recently viewed
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <Link
            key={item.ticker}
            href={`/stock/${item.ticker}`}
            className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-2.5 py-1.5 text-sm transition-all duration-200 hover:bg-accent/50 hover:border-primary/30 hover:shadow-sm"
          >
            <CompanyLogo
              name={item.name}
              ticker={item.ticker}
              logoUrl={item.logo_url ?? null}
              size={20}
            />
            <span className="font-semibold tabular-nums">{item.ticker}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
