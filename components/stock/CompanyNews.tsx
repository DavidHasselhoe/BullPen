'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, Calendar } from 'lucide-react';
import type { CompanyNews } from '@/lib/finnhub/finnhub-client';

interface CompanyNewsProps {
  ticker: string;
}

interface CompanyNewsResponse {
  success: boolean;
  news?: CompanyNews[];
  error?: string;
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

function formatTimeAgo(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 3600) {
    const minutes = Math.floor(diffInSeconds / 60);
    return `${minutes}m ago`;
  } else if (diffInSeconds < 86400) {
    const hours = Math.floor(diffInSeconds / 3600);
    return `${hours}h ago`;
  } else {
    const days = Math.floor(diffInSeconds / 86400);
    return `${days}d ago`;
  }
}

export function CompanyNews({ ticker }: CompanyNewsProps) {
  const [displayCount, setDisplayCount] = useState(5);
  
  const { data, isLoading, error } = useQuery({
    queryKey: ['company-news', ticker],
    queryFn: async (): Promise<CompanyNews[]> => {
      try {
        const response = await fetch(`/api/stock/${ticker}/news`);
        
        if (!response.ok) {
          console.error(`[CompanyNews] API error (${response.status}) for ${ticker}`);
          return [];
        }
        
        const result: CompanyNewsResponse = await response.json();

        if (result.success && result.news) {
          return result.news;
        }

        if (result.error) {
          console.error(`[CompanyNews] API returned error for ${ticker}:`, result.error);
        }

        return [];
      } catch (err) {
        console.error(`[CompanyNews] Error fetching news for ${ticker}:`, err);
        return [];
      }
    },
    enabled: !!ticker,
    staleTime: 1000 * 60 * 10, // 10 minutes - news updates more frequently
  });

  if (error) {
    return null;
  }

  if (isLoading) {
    return (
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Company News</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-3 w-1/4" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Company News</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No recent news available</p>
        </CardContent>
      </Card>
    );
  }

  const displayedNews = data.slice(0, displayCount);
  const hasMore = data.length > displayCount;

  return (
    <Card className="mb-8">
      <CardHeader>
        <CardTitle>Company News</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {displayedNews.map((article) => (
          <a
            key={article.id}
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block p-4 rounded-lg border border-border/50 hover:border-border hover:bg-accent/50 transition-colors group"
          >
            <div className="flex items-start gap-4">
              {article.image && (
                <div className="relative w-24 h-24 flex-shrink-0 rounded-lg overflow-hidden bg-muted">
                  <img
                    src={article.image}
                    alt={article.headline}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      // Hide image on error
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                </div>
              )}
              <div className="flex-1 space-y-2 min-w-0">
                <div className="flex items-start justify-between gap-4">
                  <h3 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-2 flex-1">
                    {article.headline}
                  </h3>
                  <ExternalLink className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0 mt-1" />
                </div>
                {article.summary && (
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {article.summary}
                  </p>
                )}
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {formatTimeAgo(article.datetime)}
                  </span>
                  {article.source && <span>{article.source}</span>}
                </div>
              </div>
            </div>
          </a>
        ))}
        {hasMore && (
          <Button
            variant="outline"
            onClick={() => setDisplayCount(displayCount + 5)}
            className="w-full"
          >
            Load More ({data.length - displayCount} remaining)
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
