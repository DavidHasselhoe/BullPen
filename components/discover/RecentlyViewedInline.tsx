'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import { useRecentlyViewed } from '@/hooks/use-recently-viewed';
import { slugToAssetPath } from '@/lib/assets/asset-type';
import { cn } from '@/lib/utils';

export function RecentlyViewedInline() {
  const { items } = useRecentlyViewed();

  const tickers = items.map((i) => i.ticker);

  const { data: quotes } = useQuery<Record<string, { changePercent: number }>>({
    queryKey: ['recently-viewed-quotes', tickers],
    queryFn: async () => {
      if (tickers.length === 0) return {};
      const res = await fetch('/api/quotes/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols: tickers }),
      });
      const json = await res.json();
      return json.quotes ?? {};
    },
    enabled: tickers.length > 0,
    staleTime: 2 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });

  if (items.length === 0) return null;

  return (
    <div className="flex items-center gap-3 min-w-0 overflow-hidden">
      <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/40 shrink-0">
        Recent
      </span>
      <div className="flex flex-wrap gap-1.5 min-w-0">
        {items.map((item) => {
          const pct = quotes?.[item.ticker]?.changePercent;
          const isPos = (pct ?? 0) >= 0;
          return (
            <Link
              key={item.ticker}
              href={slugToAssetPath(item.ticker)}
              className="flex items-center gap-1.5 rounded-full border border-border/50 bg-muted/20 px-2.5 py-1 text-xs font-semibold text-foreground/70 transition-all hover:border-border hover:bg-accent/50 hover:text-foreground"
            >
              <CompanyLogo
                name={item.name}
                ticker={item.ticker}
                logoUrl={item.logo_url ?? null}
                size={14}
              />
              {item.ticker}
              {pct !== undefined && (
                <span className={cn(
                  'tabular-nums text-[10px] font-semibold',
                  isPos ? 'text-emerald-500' : 'text-red-500'
                )}>
                  {isPos ? '+' : ''}{pct.toFixed(2)}%
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
