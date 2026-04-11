'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { EarningsCalendar } from '@/components/stock/EarningsCalendar';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ArrowLeft, MessageSquare, Bookmark, BookmarkCheck } from 'lucide-react';
import { ExperienceLevelToggle } from '@/components/ui/ExperienceLevelToggle';
import { ExperienceOnboardingBanner } from '@/components/stock/ExperienceOnboardingBanner';
import { useRecentlyViewed } from '@/hooks/use-recently-viewed';
import { useAIPanel } from '@/components/ai/AIPanelProvider';
import { Button } from '@/components/ui/button';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import AnimatedContent from '@/components/ui/AnimatedContent';
import { useBackground } from '@/hooks/use-background';
import { useIsWatched, useAddToWatchlist, useRemoveFromWatchlist } from '@/hooks/use-watchlist';
import { ThesisSection } from '@/components/social/ThesisSection';
import { useStockSnapshot } from '@/hooks/use-stock-snapshot';
import dynamic from 'next/dynamic';
import type { Company } from '@/lib/types/database';
import type { SignalValue } from '@/lib/finance/health-score';

const StockPricePanel = dynamic(
  () => import('@/components/stock/StockPricePanel').then((m) => ({ default: m.StockPricePanel })),
  { ssr: false, loading: () => <div className="mb-8 h-[340px] animate-pulse rounded-2xl bg-muted" /> }
);

const StatisticsGrid = dynamic(
  () => import('@/components/stock/StatisticsGrid').then((m) => ({ default: m.StatisticsGrid })),
  { ssr: false }
);

const FinancialsSection = dynamic(
  () => import('@/components/stock/FinancialsSection').then((m) => ({ default: m.FinancialsSection })),
  { ssr: false }
);

const CompanyProfileCard = dynamic(
  () => import('@/components/stock/CompanyProfileCard').then((m) => ({ default: m.CompanyProfileCard })),
  { ssr: false }
);

const PressReleasesCard = dynamic(
  () => import('@/components/stock/PressReleasesCard').then((m) => ({ default: m.PressReleasesCard })),
  { ssr: false }
);

const InsiderTransactionsCard = dynamic(
  () => import('@/components/stock/InsiderTransactionsCard').then((m) => ({ default: m.InsiderTransactionsCard })),
  { ssr: false }
);

const HealthScoreCard = dynamic(
  () => import('@/components/stock/HealthScoreCard').then((m) => ({ default: m.HealthScoreCard })),
  { ssr: false }
);

interface CompanyResponse {
  success: boolean;
  company?: Company;
  error?: string;
}

export default function StockDetailPage() {
  const params = useParams();
  const router = useRouter();
  const ticker = (params.ticker as string)?.toUpperCase() || '';
  const { hasAnimatedBackground } = useBackground();
  const { add: addRecentlyViewed } = useRecentlyViewed();
  const { open: openAIPanel, setAIContext } = useAIPanel();

  // Signals flow: HealthScoreCard → signals state → StatisticsGrid (no extra fetch needed)
  const [metricSignals, setMetricSignals] = useState<Record<string, SignalValue> | undefined>(undefined);

  const isWatched = useIsWatched(ticker);
  const addToWatchlist = useAddToWatchlist();
  const removeFromWatchlist = useRemoveFromWatchlist();

  // Batch-fetch quote + statistics + earnings in one TwelveData /batch call,
  // then seed each component's individual query cache so they skip extra requests.
  useStockSnapshot(ticker);

  // Hot Picks: count a visit when this detail page is opened (not search-only clicks)
  useEffect(() => {
    if (!ticker) return;
    void fetch(`/api/stock/${encodeURIComponent(ticker)}/visit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }).catch(() => {});
  }, [ticker]);

  const { data: company, isLoading: companyLoading } = useQuery({
    queryKey: ['company-info', ticker],
    queryFn: async (): Promise<Company | null> => {
      const response = await fetch(`/api/stock/${ticker}`);
      const data: CompanyResponse = await response.json();
      return data.success && data.company ? data.company : null;
    },
    enabled: !!ticker,
    staleTime: 60 * 1000,
  });

  // Fetch TwelveData profile for the short/common company name
  const { data: profileData } = useQuery<{ success: boolean; profile?: { name: string } }>({
    queryKey: ['company-profile', ticker],
    queryFn: async () => {
      const res = await fetch(`/api/stock/${ticker}/company-profile`);
      return res.json();
    },
    enabled: !!ticker,
    staleTime: 24 * 60 * 60 * 1000,
  });

  // Prefer TwelveData short name over the full legal name in Supabase
  const displayName = profileData?.profile?.name ?? company?.name ?? ticker;

  // Scroll to hash anchor (e.g. #earnings or #news from AI assistant links)
  useEffect(() => {
    const hash = typeof window !== 'undefined' ? window.location.hash.slice(1) : '';
    if (!hash) return;
    const t = setTimeout(() => {
      document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
    return () => clearTimeout(t);
  }, [ticker]);

  // Set AI context + recently viewed when company loads
  useEffect(() => {
    if (!ticker) return;
    setAIContext({ tickers: [ticker], label: displayName });
    return () => setAIContext(null);
  }, [ticker, displayName, setAIContext]);

  useEffect(() => {
    if (company?.ticker && displayName) {
      addRecentlyViewed(company.ticker, displayName, company.logo_url);
    }
  }, [company?.ticker, displayName, company?.logo_url, addRecentlyViewed]);

  return (
    <div className={`min-h-screen ${hasAnimatedBackground ? '' : 'bg-background'}`}>
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">

        {/* Back button */}
        <div className="mb-6">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
        </div>

        {/* Experience level onboarding — shown once when level has never been set */}
        <ExperienceOnboardingBanner />

        {/* Company header loading skeleton — shown until both DB and TwelveData profile resolve */}
        {companyLoading && !company && !profileData && (
          <Card className="mb-8">
            <CardHeader>
              <div className="flex items-center gap-3">
                <Skeleton className="h-16 w-16 rounded-full" />
                <div className="space-y-2">
                  <Skeleton className="h-7 w-48" />
                  <Skeleton className="h-4 w-32" />
                </div>
              </div>
            </CardHeader>
          </Card>
        )}

        {/* Company header — renders from DB record when available, falls back to TwelveData profile */}
        {(company || (!companyLoading && ticker)) && (
          <AnimatedContent reverse={true}>
            <Card className="mb-8">
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <CompanyLogo
                        name={displayName}
                        ticker={ticker}
                        logoUrl={company?.logo_url}
                        size={64}
                      />
                      <div>
                        <h1 className="text-3xl font-semibold text-foreground">{displayName}</h1>
                        <div className="mt-1 flex items-center gap-2">
                          <Badge variant="outline" className="font-mono text-sm">
                            {ticker}
                          </Badge>
                          {company?.sector && (
                            <span className="text-sm text-muted-foreground">
                              {company.sector}
                              {company.industry && ` • ${company.industry}`}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 flex-wrap justify-end">
                    <ExperienceLevelToggle />
                    <Button
                      variant={isWatched ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => {
                        if (!ticker) return;
                        if (isWatched) {
                          removeFromWatchlist.mutate(ticker);
                        } else {
                          addToWatchlist.mutate({ symbol: ticker, company_name: displayName });
                        }
                      }}
                      disabled={addToWatchlist.isPending || removeFromWatchlist.isPending}
                      className="gap-2"
                    >
                      {isWatched ? (
                        <><BookmarkCheck className="h-4 w-4" />Watching</>
                      ) : (
                        <><Bookmark className="h-4 w-4" />Watch</>
                      )}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => openAIPanel()} className="gap-2">
                      <MessageSquare className="h-4 w-4" />
                      Ask AI
                    </Button>
                  </div>
                </div>
              </CardHeader>
              {company?.description && (
                <CardContent>
                  <Separator className="mb-4" />
                  <p className="text-sm leading-relaxed text-muted-foreground">{company.description}</p>
                </CardContent>
              )}
            </Card>
          </AnimatedContent>
        )}

        {/* Price panel — needs only ticker, not DB record */}
        <AnimatedContent reverse={true} delay={0.05}>
          <StockPricePanel ticker={ticker} />
        </AnimatedContent>

        {/* Financial Health Score — signals are passed down to StatisticsGrid */}
        <AnimatedContent reverse={true} delay={0.08}>
          <HealthScoreCard ticker={ticker} onSignalsReady={setMetricSignals} />
        </AnimatedContent>

        {/* Company Profile (TwelveData: description, executives, facts) */}
        <AnimatedContent reverse={true} delay={0.12}>
          <CompanyProfileCard ticker={ticker} />
        </AnimatedContent>

        {/* Statistics (TwelveData) — receives signals from HealthScoreCard */}
        <AnimatedContent reverse={true} delay={0.15}>
          <StatisticsGrid ticker={ticker} signals={metricSignals} />
        </AnimatedContent>

        {/* Financials (TwelveData) */}
        <AnimatedContent reverse={true} delay={0.2}>
          <FinancialsSection ticker={ticker} />
        </AnimatedContent>

        {/* Insider Transactions (TwelveData — Venture plan) */}
        <AnimatedContent reverse={true} delay={0.24}>
          <InsiderTransactionsCard ticker={ticker} />
        </AnimatedContent>

        {/* Earnings calendar */}
        <div id="earnings" className="mb-8 scroll-mt-6">
          <AnimatedContent reverse={true} delay={0.15}>
            <EarningsCalendar ticker={ticker} />
          </AnimatedContent>
        </div>

        {/* Press Releases (TwelveData) */}
        <AnimatedContent reverse={true} delay={0.22}>
          <div className="mb-8">
            <PressReleasesCard ticker={ticker} />
          </div>
        </AnimatedContent>

        {/* Community theses */}
        <AnimatedContent reverse={true} delay={0.3}>
          <Card>
            <CardContent className="pt-6">
              <ThesisSection symbol={ticker} />
            </CardContent>
          </Card>
        </AnimatedContent>

      </div>
    </div>
  );
}
