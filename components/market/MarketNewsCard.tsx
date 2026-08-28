'use client';

import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ExternalLink } from 'lucide-react';
import type { MarketNews } from '@/lib/finnhub/finnhub-client';

interface MarketNewsCardProps {
  news: MarketNews[];
  isLoading?: boolean;
  limit?: number;
  isHoldingsMode?: boolean;
}

function formatTimestamp(timestamp: number, t: TFunction): string {
  const date = new Date(timestamp * 1000);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  if (diffHours < 1) {
    const diffMins = Math.floor(diffMs / (1000 * 60));
    return diffMins < 1 ? t('newsJustNow') : t('newsMinsAgo', { mins: diffMins });
  } else if (diffHours < 24) {
    return t('newsHoursAgo', { hours: diffHours });
  } else if (diffDays === 1) {
    return t('newsYesterday');
  } else if (diffDays < 7) {
    return t('newsDaysAgo', { days: diffDays });
  } else {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
}

function NewsItem({ article, t }: { article: MarketNews; t: TFunction }) {
  return (
    <a
      href={article.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block cursor-pointer rounded-lg p-3 -mx-2.5 transition-all duration-200 hover:bg-accent/50 hover:shadow-sm border border-transparent hover:border-border/50 group"
    >
      <div className="space-y-1.5">
        <div className="flex items-start justify-between gap-2">
          <h4 className="font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-2 flex-1 text-sm leading-snug">
            {article.headline}
          </h4>
          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
        <div className="text-xs text-muted-foreground">
          {article.source || t('newsFallbackSource')}
          <span className="mx-1.5">•</span>
          {formatTimestamp(article.datetime, t)}
        </div>
      </div>
    </a>
  );
}

export function MarketNewsCard({ news, isLoading, limit = 5, isHoldingsMode }: MarketNewsCardProps) {
  const { t } = useTranslation('market');
  const displayNews = news.slice(0, limit);

  if (isLoading) {
    return (
      <Card className="border-border/50 min-w-0 overflow-hidden">
        <CardHeader>
          <CardTitle>{t('newsCardTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/4" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/50 min-w-0 overflow-hidden">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {t('newsCardTitle')}
          {isHoldingsMode && (
            <span className="text-xs font-normal text-muted-foreground">{t('newsCardPortfolioSuffix')}</span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {displayNews.length > 0 ? (
          displayNews.map((article) => (
            <NewsItem key={article.id} article={article} t={t} />
          ))
        ) : (
          <p className="text-sm text-muted-foreground py-8 text-center">
            {t('newsCardEmpty')}
          </p>
        )}
      </CardContent>
    </Card>
  );
}