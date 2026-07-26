'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, ArrowLeft, Target } from 'lucide-react';
import { useBackground } from '@/hooks/use-background';
import { humanizeError } from '@/lib/errors/humanize';
import { cn } from '@/lib/utils';
import { PicksPerformanceChart } from '@/components/picks/PicksPerformanceChart';
import { PicksTable } from '@/components/picks/PicksTable';
import { PicksMethodology } from '@/components/picks/PicksMethodology';
import { TrackRecordStats } from '@/components/picks/TrackRecordStats';
import type { PerformanceResponse } from '@/lib/picks/types';

type ApiResponse = PerformanceResponse & { success: boolean; error?: string };

export default function PicksClientPage() {
  const { hasAnimatedBackground } = useBackground();

  const { data, isLoading, error } = useQuery<ApiResponse>({
    queryKey: ['picks-performance'],
    queryFn: async () => {
      const res = await fetch('/api/picks/performance');
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      return res.json();
    },
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  return (
    <div className={cn('min-h-screen', hasAnimatedBackground ? '' : 'bg-background')}>
      <main className="container mx-auto min-w-0 max-w-6xl px-4 py-8 sm:px-6 lg:px-8 page-enter">
        <Link
          href="/discover"
          className="mb-6 inline-flex items-center gap-1.5 rounded text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Back to Discover
        </Link>

        <header className="mb-8">
          <div className="mb-2 flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <Target className="h-5 w-5 text-primary" aria-hidden />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Bull&apos;s Track Record
            </h1>
          </div>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            One AI stock pick every Monday, priced at the next market open and tracked
            from there — permanently. Every pick we&apos;ve ever made is below, winners
            and losers alike, measured against buying the S&amp;P on the very same days.
          </p>
        </header>

        {isLoading && <PicksSkeleton />}

        {!isLoading && error && (
          <div className="flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/5 p-6">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" aria-hidden />
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                Couldn&apos;t load the track record
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">{humanizeError(error)}</p>
            </div>
          </div>
        )}

        {!isLoading && !error && data?.success && (
          <div className="space-y-8">
            <TrackRecordStats summary={data.summary} />

            {/* Only once there's a line to draw. Before that the stat card above
                already says the record is too young, and an empty 360px chart
                frame would just be a large box repeating it. */}
            {data.series.length >= 2 && (
              <PicksPerformanceChart series={data.series} normalized={data.normalized} />
            )}

            <section aria-labelledby="all-picks-heading">
              <h2
                id="all-picks-heading"
                className="mb-3 text-sm font-semibold uppercase tracking-widest text-muted-foreground/60"
              >
                Every pick
              </h2>
              <PicksTable picks={data.picks} />
            </section>

            <PicksMethodology />
          </div>
        )}

        {!isLoading && !error && data && !data.success && (
          <div className="rounded-xl border border-border/50 bg-card/40 px-5 py-8 text-center">
            <p className="text-sm text-muted-foreground">
              Market data is temporarily unavailable, so returns can&apos;t be priced right
              now. The picks themselves are unaffected — try again shortly.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

function PicksSkeleton() {
  return (
    <div className="space-y-8" aria-hidden>
      <div className="h-[132px] rounded-xl border border-border/30 animate-shimmer" />
      <div className="h-[360px] rounded-xl border border-border/30 animate-shimmer" />
      <div>
        <div className="mb-3 h-3.5 w-28 rounded animate-shimmer" />
        <div className="h-[320px] rounded-xl border border-border/30 animate-shimmer" />
      </div>
    </div>
  );
}
