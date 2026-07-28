'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import { useRecentlyViewed } from '@/hooks/use-recently-viewed';
import { useRecentlyViewedQuotes } from '@/hooks/use-recently-viewed-quotes';
import { History } from 'lucide-react';
import { cn } from '@/lib/utils';
import { slugToAssetPath } from '@/lib/assets/asset-type';

export function RecentlyViewedCard() {
  const { items } = useRecentlyViewed();

  const tickers = items.map((i) => i.ticker);
  const { data: quotes } = useRecentlyViewedQuotes(tickers);

  if (items.length === 0) return null;

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="h-4 w-4 text-muted-foreground" />
          Recently viewed
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          {items.map((item) => {
            const pct = quotes?.[item.ticker]?.changePercent;
            const isPos = (pct ?? 0) >= 0;
            return (
              <Link
                key={item.ticker}
                href={slugToAssetPath(item.ticker)}
                className="flex items-center gap-2.5 rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5 transition-all duration-200 hover:bg-accent/50 hover:border-primary/30 hover:shadow-sm"
              >
                <CompanyLogo
                  name={item.name}
                  ticker={item.ticker}
                  logoUrl={item.logo_url ?? null}
                  size={28}
                  className="rounded overflow-hidden shrink-0"
                />
                <div className="flex flex-col min-w-0">
                  <span className="text-sm font-bold text-foreground leading-tight">
                    {item.ticker}
                  </span>
                  {pct !== undefined ? (
                    <span className={cn(
                      'text-xs font-semibold tabular-nums leading-tight',
                      isPos ? 'text-emerald-500' : 'text-red-500'
                    )}>
                      {isPos ? '+' : ''}{pct.toFixed(2)}%
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground/85 leading-tight">—</span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
