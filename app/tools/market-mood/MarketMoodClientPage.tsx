'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { RefreshCw, Gauge } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIntlLocale } from '@/hooks/use-intl-locale';
import { EmptyState } from '@/components/ui/EmptyState';
import { ToolPage, ToolHeader, ToolSectionTitle } from '@/components/tools/ToolHeader';
import { MoodHero, SignalCard, MoodSkeleton } from '@/components/market/MarketMoodDisplay';
import type { MarketMoodData } from '@/app/api/market/mood/route';

/** The composite is built from four signals; the API drops any it has no data for. */
const TOTAL_SIGNALS = 4;

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MarketMoodClientPage() {
  const { t } = useTranslation('tools');
  const locale = useIntlLocale();

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
    ? new Date(dataUpdatedAt).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' })
    : null;

  return (
    <ToolPage>
      <ToolHeader
        icon={<Gauge />}
        title={t('marketMoodTitle', 'Market Mood')}
        description={t('marketMoodSubtitle', 'Fear & Greed Index: composite of 4 market signals')}
        actions={
          <>
            {updatedLabel && (
              <span className="hidden text-xs text-muted-foreground tabular-nums sm:inline">{updatedLabel}</span>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => refetch()}
              disabled={isFetching}
              aria-label={t('marketMoodRefreshLabel', 'Refresh')}
            >
              <RefreshCw className={cn('h-3.5 w-3.5 text-muted-foreground', isFetching && 'animate-spin')} />
            </Button>
          </>
        }
      />

      <div className="space-y-10">
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
            <MoodHero score={composite} label={data.label} animated={!!data} />

            <section>
              <ToolSectionTitle className="mb-1">{t('marketMoodSignalBreakdown', 'Signal Breakdown')}</ToolSectionTitle>
              <p className="mb-4 text-sm text-muted-foreground">
                {data.signals.length < TOTAL_SIGNALS
                  ? t('marketMoodSignalsPartial', '{{count}} of {{total}} signals are available right now, so the score is built from those and reweighted.', {
                      count: data.signals.length,
                      total: TOTAL_SIGNALS,
                    })
                  : t('marketMoodSignalDescription', 'How each input contributes to the composite')}
              </p>

              <div className={cn(
                'grid gap-3',
                data.signals.length > 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 max-w-md mx-auto w-full'
              )}>
                {data.signals.map((signal) => (
                  <SignalCard key={signal.name} signal={signal} />
                ))}
              </div>
            </section>

            <section className="border-t border-border/40 pt-5">
              <ToolSectionTitle className="mb-1.5">{t('marketMoodMethodologyHeading', 'Methodology')}</ToolSectionTitle>
              <p className="max-w-prose text-xs leading-relaxed text-muted-foreground">
                {t(
                  'marketMoodMethodology',
                  'Composite weighted by {{vix}} volatility (35%), {{sp500}} momentum vs 125-day average (30%), high-yield bond demand {{hygLqd}} (20%), and safe-haven flight {{spyTlt}} (15%). A score of {{low}} represents extreme fear; {{high}}, extreme greed.',
                  { vix: 'VIX', sp500: 'S&P 500', hygLqd: 'HYG/LQD', spyTlt: 'SPY/TLT', low: '0', high: '100' }
                )}
              </p>
            </section>
          </>
        ) : null}
      </div>
    </ToolPage>
  );
}
