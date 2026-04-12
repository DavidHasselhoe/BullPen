'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ExternalLink, Newspaper } from 'lucide-react';
import type { PressRelease } from '@/lib/twelvedata/twelvedata-client';

interface PressReleasesResponse {
  success: boolean;
  data?: PressRelease[];
  error?: string;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

interface Props {
  ticker: string;
}

export function PressReleasesCard({ ticker }: Props) {
  const { data, isLoading, isError } = useQuery<PressReleasesResponse>({
    queryKey: ['press-releases', ticker],
    queryFn: async () => {
      const res = await fetch(`/api/stock/${ticker}/press-releases?limit=8`);
      if (!res.ok) throw new Error('Failed to fetch press releases');
      return res.json();
    },
    staleTime: 60 * 60 * 1000, // 1 h
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Newspaper className="h-4 w-4" />
            Press Releases
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="space-y-1">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-3 w-24" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (isError || !data?.success || !data.data?.length) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Newspaper className="h-4 w-4" />
          Press Releases
        </CardTitle>
      </CardHeader>
      <CardContent className="divide-y divide-border">
        {data.data.map((release, i) => {
          const inner = (
            <>
              <div className="min-w-0 flex-1">
                <p
                  className={`text-sm font-medium leading-snug line-clamp-2 ${
                    release.url ? 'group-hover:text-primary transition-colors' : ''
                  }`}
                >
                  {release.title}
                </p>
                {release.snippet && (
                  <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                    {release.snippet}
                  </p>
                )}
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatDate(release.published_at)}
                </p>
              </div>
              {release.url ? (
                <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground group-hover:text-primary transition-colors mt-0.5" />
              ) : null}
            </>
          );
          return release.url ? (
            <a
              key={i}
              href={release.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0 group"
            >
              {inner}
            </a>
          ) : (
            <div key={i} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
              {inner}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
