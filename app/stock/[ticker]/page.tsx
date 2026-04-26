'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { EarningsCalendar } from '@/components/stock/EarningsCalendar';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ArrowLeft, MessageSquare, SearchX } from 'lucide-react';
import { ExperienceLevelToggle } from '@/components/ui/ExperienceLevelToggle';
import { ExperienceOnboardingBanner } from '@/components/stock/ExperienceOnboardingBanner';
import { useRecentlyViewed } from '@/hooks/use-recently-viewed';
import { useAIPanel } from '@/components/ai/AIPanelProvider';
import { Button } from '@/components/ui/button';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import AnimatedContent from '@/components/ui/AnimatedContent';
import { useBackground } from '@/hooks/use-background';
import { AddToListPicker } from '@/components/watchlist/AddToListPicker';
import { ThesisSection } from '@/components/social/ThesisSection';
import { useStockSnapshot } from '@/hooks/use-stock-snapshot';
import dynamic from 'next/dynamic';
import type { Company } from '@/lib/types/database';
import type { SignalValue } from '@/lib/finance/health-score';
import { HOT_PICKS_QUERY_KEY } from '@/lib/discover/hot-picks-query';
import { postStockVisit } from '@/lib/discover/post-stock-visit';
import { StockSectionBoundary } from '@/components/stock/StockSectionBoundary';

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

const SankeyCard = dynamic(
  () => import('@/components/stock/SankeyCard').then((m) => ({ default: m.SankeyCard })),
  { ssr: false }
);

const CompetitorPills = dynamic(
  () => import('@/components/stock/CompetitorsCard').then((m) => ({ default: m.CompetitorPills })),
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
  const queryClient = useQueryClient();
  const ticker = (params.ticker as string)?.toUpperCase() || '';
  const { hasAnimatedBackground } = useBackground();
  const { add: addRecentlyViewed } = useRecentlyViewed();
  const { open: openAIPanel, setAIContext } = useAIPanel();

  // Signals flow: HealthScoreCard → signals state → StatisticsGrid (no extra fetch needed)
  const [metricSignals, setMetricSignals] = useState<Record<string, SignalValue> | undefined>(undefined);

  // Batch-fetch quote + statistics + earnings in one TwelveData /batch call,
  // then seed each component's individual query cache so they skip extra requests.
  useStockSnapshot(ticker);

  // Hot Picks: record visit + invalidate list so Discover updates when you navigate back
  useEffect(() => {
    if (!ticker) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await postStockVisit(ticker);
        if (!cancelled && res.ok) {
          await queryClient.invalidateQueries({ queryKey: HOT_PICKS_QUERY_KEY });
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ticker, queryClient]);

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
  const { data: profileData, isLoading: profileLoading } = useQuery<{ success: boolean; profile?: { name: string } }>({
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

  // Both data sources have settled and neither knows this ticker → show 404
  const isNotFound =
    !companyLoading && !profileLoading &&
    company === null &&
    profileData !== undefined &&
    !profileData?.profile;

  if (isNotFound) {
    return (
      <div className="min-h-screen bg-background">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="mb-6">
            <button
              onClick={() => router.back()}
              className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
          </div>
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-muted">
              <SearchX className="h-10 w-10 text-muted-foreground/40" />
            </div>
            <h1 className="text-2xl font-semibold mb-2">
              &ldquo;{ticker}&rdquo; not found
            </h1>
            <p className="text-sm text-muted-foreground max-w-sm mt-1">
              We couldn&apos;t find a stock with that symbol. Double-check the ticker or search for a company name.
            </p>
            <Button className="mt-6" onClick={() => router.push('/')}>
              Back to Dashboard
            </Button>
          </div>
        </div>
      </div>
    );
  }

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
                        <CompetitorPills ticker={ticker} />
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 flex-wrap justify-end">
                    <ExperienceLevelToggle />
                    <AddToListPicker symbol={ticker} companyName={displayName} />
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

        {/* Company Profile (TwelveData: description, executives, facts) */}
        <StockSectionBoundary>
          <AnimatedContent reverse={true} delay={0.08}>
            <CompanyProfileCard ticker={ticker} />
          </AnimatedContent>
        </StockSectionBoundary>

        {/* Financial Health Score — signals are passed down to StatisticsGrid */}
        <StockSectionBoundary>
          <AnimatedContent reverse={true} delay={0.12}>
            <HealthScoreCard ticker={ticker} onSignalsReady={setMetricSignals} />
          </AnimatedContent>
        </StockSectionBoundary>

        {/* Statistics (TwelveData) — receives signals from HealthScoreCard */}
        <StockSectionBoundary>
          <AnimatedContent reverse={true} delay={0.15}>
            <StatisticsGrid ticker={ticker} signals={metricSignals} />
          </AnimatedContent>
        </StockSectionBoundary>

        {/* Financials (TwelveData) */}
        <StockSectionBoundary>
          <AnimatedContent reverse={true} delay={0.2}>
            <FinancialsSection ticker={ticker} />
          </AnimatedContent>
        </StockSectionBoundary>

        {/* Revenue Flow (Sankey) */}
        <StockSectionBoundary>
          <AnimatedContent reverse={true} delay={0.22}>
            <SankeyCard ticker={ticker} />
          </AnimatedContent>
        </StockSectionBoundary>

        {/* Insider Transactions (TwelveData — Venture plan) */}
        <StockSectionBoundary>
          <AnimatedContent reverse={true} delay={0.24}>
            <InsiderTransactionsCard ticker={ticker} />
          </AnimatedContent>
        </StockSectionBoundary>

        {/* Earnings calendar */}
        <div id="earnings" className="mb-8 scroll-mt-6">
          <StockSectionBoundary>
            <AnimatedContent reverse={true} delay={0.15}>
              <EarningsCalendar ticker={ticker} />
            </AnimatedContent>
          </StockSectionBoundary>
        </div>

        {/* Press Releases (TwelveData) */}
        <StockSectionBoundary>
          <AnimatedContent reverse={true} delay={0.22}>
            <div className="mb-8">
              <PressReleasesCard ticker={ticker} />
            </div>
          </AnimatedContent>
        </StockSectionBoundary>

        {/* Community theses */}
        <StockSectionBoundary>
          <AnimatedContent reverse={true} delay={0.3}>
            <Card>
              <CardContent className="pt-6">
                <ThesisSection symbol={ticker} />
              </CardContent>
            </Card>
          </AnimatedContent>
        </StockSectionBoundary>

      </div>
    </div>
  );
}
