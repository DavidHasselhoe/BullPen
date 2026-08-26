'use client';

import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { History } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import { useRecentlyCompared } from '@/hooks/use-recently-compared';

export function RecentlyComparedCard() {
  const { t } = useTranslation('tools');
  const { items } = useRecentlyCompared();

  if (items.length === 0) return null;

  return (
    <Card className="mb-8 border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="h-4 w-4 text-muted-foreground" />
          {t('compareRecentlyCompared')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          {items.map((entry) => (
            <Link
              key={entry.tickers.join(',')}
              href={`/tools/compare?tickers=${entry.tickers.join(',')}`}
              className="flex items-center gap-2.5 rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5 transition-all duration-200 hover:bg-accent/50 hover:border-primary/30 hover:shadow-sm"
            >
              <div className="flex -space-x-2 shrink-0">
                {entry.companies.map((c) => (
                  <CompanyLogo
                    key={c.ticker}
                    name={c.name}
                    ticker={c.ticker}
                    logoUrl={c.logo_url}
                    size={24}
                    className="rounded-full ring-2 ring-background"
                  />
                ))}
              </div>
              <span className="text-sm font-semibold text-foreground">
                {entry.tickers.join(', ')}
              </span>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
