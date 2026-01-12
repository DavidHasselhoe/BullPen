'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ExternalLink, Calendar } from 'lucide-react';
import type { MarketNews } from '@/lib/finnhub/finnhub-client';

interface MarketNewsCardProps {
  news: MarketNews[];
  isLoading?: boolean;
  limit?: number;
}

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  if (diffHours < 1) {
    const diffMins = Math.floor(diffMs / (1000 * 60));
    return `${diffMins}m ago`;
  } else if (diffHours < 24) {
    return `${diffHours}h ago`;
  } else if (diffDays === 1) {
    return 'Yesterday';
  } else if (diffDays < 7) {
    return `${diffDays}d ago`;
  } else {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
}

function NewsItem({ article }: { article: MarketNews }) {
  return (
    <a
      href={article.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block hover:bg-accent/50 transition-colors rounded-md p-3 -mx-3 group"
    >
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <h4 className="font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-2 flex-1">
            {article.headline}
          </h4>
          <ExternalLink className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
        {article.summary && (
          <p className="text-sm text-muted-foreground line-clamp-2">
            {article.summary}
          </p>
        )}
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {formatTimestamp(article.datetime)}
          </span>
          {article.source && (
            <>
              <span>•</span>
              <span>{article.source}</span>
            </>
          )}
        </div>
      </div>
    </a>
  );
}

export function MarketNewsCard({ news, isLoading, limit = 5 }: MarketNewsCardProps) {
  const displayNews = news.slice(0, limit);

  if (isLoading) {
    return (
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle>Market News</CardTitle>
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
    <Card className="border-border/50">
      <CardHeader>
        <CardTitle>Market News</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {displayNews.length > 0 ? (
          displayNews.map((article) => (
            <NewsItem key={article.id} article={article} />
          ))
        ) : (
          <p className="text-sm text-muted-foreground py-8 text-center">
            No news available
          </p>
        )}
      </CardContent>
    </Card>
  );
}