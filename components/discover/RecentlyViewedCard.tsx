'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import { useRecentlyViewed } from '@/hooks/use-recently-viewed';
import { History } from 'lucide-react';

export function RecentlyViewedCard() {
  const { items } = useRecentlyViewed();

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
          {items.map((item) => (
            <Link
              key={item.ticker}
              href={`/stock/${item.ticker}`}
              className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-sm transition-all duration-200 hover:bg-accent/50 hover:border-primary/30 hover:shadow-sm"
            >
              <CompanyLogo
                name={item.name}
                ticker={item.ticker}
                logoUrl={null}
                size={24}
                className="rounded overflow-hidden shrink-0"
              />
              <span className="font-semibold tabular-nums">{item.ticker}</span>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
