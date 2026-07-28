'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import Image from 'next/image';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import { Rss, Users, Lock, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { FeedItem } from '@/app/api/social/feed/route';

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function FeedCard({ item }: { item: FeedItem }) {
  const displayName = item.full_name || item.username || 'Someone';
  const initials = displayName.slice(0, 2).toUpperCase();
  const profileHref = item.username ? `/users/${encodeURIComponent(item.username)}` : '#';

  return (
    <div className="flex items-start gap-3 rounded-xl border border-border bg-card px-4 py-3 hover:border-border/80 transition-colors">
      <Link href={profileHref} className="shrink-0 mt-0.5">
        {item.avatar_url ? (
          <Image src={item.avatar_url} alt={displayName} width={36} height={36} className="rounded-full object-cover" />
        ) : (
          <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
            <span className="text-xs font-semibold text-primary">{initials}</span>
          </div>
        )}
      </Link>

      <div className="flex-1 min-w-0">
        <p className="text-sm">
          <Link href={profileHref} className="font-semibold text-foreground hover:text-primary transition-colors">
            {displayName}
          </Link>
          <span className="text-muted-foreground"> added </span>
          <Link href={`/stock/${item.symbol}`} className="font-semibold text-foreground hover:text-primary transition-colors inline-flex items-center gap-1.5">
            <CompanyLogo name={item.company_name} ticker={item.symbol} logoUrl={null} size={16} />
            {item.symbol}
          </Link>
          <span className="text-muted-foreground"> to their portfolio</span>
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">{timeAgo(item.added_at)}</p>
      </div>
    </div>
  );
}

export default function SocialFeedPage() {
  const { isAuthenticated } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['social-feed'],
    queryFn: async (): Promise<FeedItem[]> => {
      const res = await fetch('/api/social/feed');
      if (!res.ok) return [];
      const d = await res.json();
      return d.feed ?? [];
    },
    enabled: isAuthenticated,
    staleTime: 30_000,
    // Always refetch when the user tabs back so feed reflects activity while they were away
    refetchOnWindowFocus: 'always',
  });

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-sm w-full mx-4">
          <CardContent className="pt-8 pb-8 text-center space-y-3">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <Lock className="h-6 w-6 text-primary" />
            </div>
            <p className="font-semibold text-foreground">Sign in to see your feed</p>
            <p className="text-sm text-muted-foreground">Follow other investors to see their portfolio activity here.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isEmpty = !isLoading && (data?.length ?? 0) === 0;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-10 space-y-6">

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <Rss className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Feed</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Portfolio activity from investors you follow.</p>
          </div>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-xl" />
            ))}
          </div>
        ) : isEmpty ? (
          <div className="flex flex-col items-center gap-5 py-20 text-center">
            <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
              <Users className="h-8 w-8 text-muted-foreground/80" />
            </div>
            <div className="space-y-1">
              <p className="text-base font-medium text-foreground">No activity yet</p>
              <p className="text-sm text-muted-foreground">
                Follow investors to see their portfolio changes here.
              </p>
            </div>
            <Button asChild variant="outline">
              <Link href="/users" className="gap-2">
                <TrendingUp className="h-4 w-4" />
                Browse members
              </Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {data!.map((item) => (
              <FeedCard key={`${item.user_id}-${item.symbol}-${item.added_at}`} item={item} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
