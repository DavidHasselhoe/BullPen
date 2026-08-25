'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { ArrowLeft, RefreshCw, Gauge } from 'lucide-react';
import { useBackground } from '@/hooks/use-background';
import { cn } from '@/lib/utils';
import { EmptyState } from '@/components/ui/EmptyState';
import { MoodHero, SignalCard, MoodSkeleton } from '@/components/market/MarketMoodDisplay';
import type { MarketMoodData } from '@/app/api/market/mood/route';

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MarketMoodClientPage() {
  const { t } = useTranslation('tools');
  const { hasAnimatedBackground } = useBackground();

  const { data, isLoading, isError, refetch, isFetching, dataUpdatedAt } =
    useQuery<MarketMoodData>({
      queryKey: ['market-mood'],
      queryFn: async () => {
        const res = await fetch('/api/market/mood');
        if (!res.ok) throw new Error('Failed to load market mood');
        return res.json();
      },
      staleTime:       15 * 60 * 1000,
      gcTime:          30 * 60 * 1000,
      refetchInterval: 15 * 60 * 1000,
      retry: 1,
    });

  const composite = data?.composite ?? 0;

  const updatedLabel = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString('en-US', {
        hour: 'numeric', minute: '2-digit', hour12: true,
      })
    : null;

  return (
    <div className={cn('min-h-screen', !hasAnimatedBackground && 'bg-background')}>
      <div className="max-w-2xl mx-auto px-4 py-6 sm:py-10 space-y-10">

        {/* Header */}
        <div className="mb-2">
          <Link
            href="/tools"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-5 group"
          >
            <ArrowLeft className="h-3 w-3 transition-transform group-hover:-translate-x-0.5" />
            {t('allToolsLink', 'All tools')}
          </Link>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                <Gauge className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-foreground">{t('marketMoodTitle', 'Market Mood')}</h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {t('marketMoodSubtitle', 'Fear & Greed Index: composite of 4 market signals')}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {updatedLabel && (
                <span className="hidden sm:inline text-xs text-muted-foreground/85 font-mono tabular-nums">
                  {updatedLabel}
                </span>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => refetch()}
                disabled={isFetching}
                aria-label={t('marketMoodRefreshLabel', 'Refresh')}
              >
                <RefreshCw className={cn('h-3.5 w-3.5 text-muted-foreground/80', isFetching && 'animate-spin')} />
              </Button>
            </div>
          </div>
        </div>

        {/* Body */}
        {isLoading ? (
          <MoodSkeleton />
        ) : isError ? (
          <EmptyState
            pose="error"
            title={t('marketMoodErrorTitle', "Couldn't load market data right now")}
            imageSize={120}
            className="py-16"
          >
            <div className="flex justify-center">
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                {t('tryAgainButton', 'Try again')}
              </Button>
            </div>
          </EmptyState>
        ) : data ? (
          <>
            <div className="pt-2 pb-2">
              <MoodHero score={composite} label={data.label} animated={!!data} />
            </div>

            {/* Signal section — header + cards grouped so the gap between
                them is deterministic regardless of parent space-y rules. */}
            <div className="space-y-4">
              <div className="px-1">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="text-[11px] font-bold uppercase tracking-[0.22em] text-muted-foreground/80">
                    {t('marketMoodSignalBreakdown', 'Signal Breakdown')}
                  </h2>
                  <span className="text-[11px] font-mono text-muted-foreground/80 tracking-wider">
                    {t('marketMoodSignalCount', '{{count}} of 4', { count: data.signals.length })}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground/80 mt-1">
                  {t('marketMoodSignalDescription', 'How each input contributes to the composite')}
                </p>
              </div>

              <div className={cn(
                'grid gap-3',
                data.signals.length > 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 max-w-md mx-auto w-full'
              )}>
                {data.signals.map((signal) => (
                  <SignalCard key={signal.name} signal={signal} />
                ))}
              </div>
            </div>

            {/* Methodology — quiet, editorial, mono accent on symbol codes */}
            <div className="border-t border-border/30 pt-5 px-1">
              <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-muted-foreground/80 mb-2">
                {t('marketMoodMethodologyHeading', 'Methodology')}
              </div>
              <p className="text-[11px] leading-relaxed text-muted-foreground/85">
                {t(
                  'marketMoodMethodology',
                  'Composite weighted by {{vix}} volatility (35%), {{sp500}} momentum vs 125-day average (30%), high-yield bond demand {{hygLqd}} (20%), and safe-haven flight {{spyTlt}} (15%). A score of {{low}} represents extreme fear; {{high}}, extreme greed.',
                  { vix: 'VIX', sp500: 'S&P 500', hygLqd: 'HYG/LQD', spyTlt: 'SPY/TLT', low: '0', high: '100' }
                )}
              </p>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
