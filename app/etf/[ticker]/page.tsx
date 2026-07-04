'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { EarningsCalendar } from '@/components/stock/EarningsCalendar';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ArrowLeft, MessageSquare } from 'lucide-react';
import { ExperienceLevelToggle } from '@/components/ui/ExperienceLevelToggle';
import { ExperienceOnboardingBanner } from '@/components/stock/ExperienceOnboardingBanner';
import { useRecentlyViewed } from '@/hooks/use-recently-viewed';
import { useAIPanel } from '@/components/ai/AIPanelProvider';
import { Button } from '@/components/ui/button';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import { EmptyState } from '@/components/ui/EmptyState';
import AnimatedContent from '@/components/ui/AnimatedContent';
import { useBackground } from '@/hooks/use-background';
import { AddToListPicker } from '@/components/watchlist/AddToListPicker';
import { ThesisSection } from '@/components/social/ThesisSection';
import { useStockSnapshot } from '@/hooks/use-stock-snapshot';
import dynamic from 'next/dynamic';
import type { Company } from '@/lib/types/database';
import { HOT_PICKS_QUERY_KEY } from '@/lib/discover/hot-picks-query';
import { postStockVisit } from '@/lib/discover/post-stock-visit';
import { StockSectionBoundary } from '@/components/stock/StockSectionBoundary';
import { slugToSymbol, inferAssetType } from '@/lib/assets/asset-type';

const StockPricePanel = dynamic(
  () => import('@/components/stock/StockPricePanel').then((m) => ({ default: m.StockPricePanel })),
  { ssr: false, loading: () => <div className="mb-8 h-[340px] animate-shimmer rounded-2xl" /> }
);

const StatisticsGrid = dynamic(
  () => import('@/components/stock/StatisticsGrid').then((m) => ({ default: m.StatisticsGrid })),
  { ssr: false }
);

const CompanyProfileCard = dynamic(
  () => import('@/components/stock/CompanyProfileCard').then((m) => ({ default: m.CompanyProfileCard })),
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

export default function EtfDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { i18n } = useTranslation();
  const rawTicker = (params.ticker as string) ?? '';
  const ticker = rawTicker.toUpperCase();

  // Redirect crypto/commodity/forex/stocks back to the correct route
  useEffect(() => {
    if (!rawTicker) return;
    const sym = slugToSymbol(ticker);
    const type = inferAssetType(sym);
    if (type === 'crypto' || type === 'commodity' || type === 'forex') {
      router.replace(`/asset/${ticker}`);
    }
  }, [rawTicker, ticker, router]);

  const { hasAnimatedBackground } = useBackground();
  const { add: addRecentlyViewed } = useRecentlyViewed();
  const { open: openAIPanel, setAIContext } = useAIPanel();

  const snapshot = useStockSnapshot(ticker);

  // If the snapshot reveals this is actually a stock (not an ETF), redirect to /stock/
  const snapshotAssetType = snapshot.data?.instrumentType
    ? inferAssetType(ticker, snapshot.data.instrumentType)
    : snapshot.isLoading
      ? 'unknown'
      : 'etf'; // default to etf on this route

  useEffect(() => {
    if (!snapshot.isLoading && snapshotAssetType === 'stock') {
      router.replace(`/stock/${ticker}`);
    }
  }, [snapshotAssetType, snapshot.isLoading, ticker, router]);

  // Hot Picks: record visit + invalidate list
  useEffect(() => {
    if (!ticker) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await postStockVisit(ticker);
        if (!cancelled && res.ok) {
          await queryClient.invalidateQueries({ queryKey: HOT_PICKS_QUERY_KEY });
        }
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [ticker, queryClient]);

  useEffect(() => {
    if (!ticker) return;
    fetch(`/api/stock/${ticker}/freshness`).catch(() => {});
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

  const { data: profileData, isLoading: profileLoading } = useQuery<{ success: boolean; profile?: { name: string } }>({
    queryKey: ['company-profile', ticker, i18n.language],
    queryFn: async () => {
      const res = await fetch(`/api/stock/${ticker}/company-profile?lang=${i18n.language}`);
      return res.json();
    },
    enabled: !!ticker,
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
  });

  const displayName = profileData?.profile?.name ?? company?.name ?? ticker;

  useEffect(() => {
    const hash = typeof window !== 'undefined' ? window.location.hash.slice(1) : '';
    if (!hash) return;
    const t = setTimeout(() => {
      document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
    return () => clearTimeout(t);
  }, [ticker]);

  useEffect(() => {
    if (!ticker) return;
    setAIContext({ tickers: [ticker], label: displayName });
    return () => setAIContext(null);
  }, [ticker, displayName, setAIContext]);

  useEffect(() => {
    if (company?.ticker && displayName) {
      addRecentlyViewed(company.ticker, displayName, company.logo_url, 'ETF');
    }
  }, [company?.ticker, displayName, company?.logo_url, addRecentlyViewed]);

  // Key off a real quote (price > 0), not snapshot.data.success — the batch
  // request returns success:true even for a bogus symbol.
  const hasRealQuote = (snapshot.data?.quote?.price ?? 0) > 0;
  const isNotFound =
    !companyLoading && !profileLoading && !snapshot.isLoading &&
    company === null &&
    profileData !== undefined &&
    !profileData?.profile &&
    snapshot.data?.success === true &&
    !hasRealQuote;

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
          <div className="py-20">
            <EmptyState
              pose="error"
              title={`“${ticker}” not found`}
              description="We couldn't find an ETF with that symbol."
            >
              <Button onClick={() => router.push('/dashboard')}>Back to Dashboard</Button>
            </EmptyState>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${hasAnimatedBackground ? '' : 'bg-background'}`}>
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

        <ExperienceOnboardingBanner />

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
                          <Badge variant="secondary" className="text-xs font-medium">
                            ETF
                          </Badge>
                          {company?.sector && (
                            <span className="text-sm text-muted-foreground">{company.sector}</span>
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

        {/* Price chart */}
        <AnimatedContent reverse={true} delay={0.05}>
          <StockPricePanel ticker={ticker} />
        </AnimatedContent>

        {/* Company Profile */}
        <StockSectionBoundary>
          <AnimatedContent reverse={true} delay={0.08}>
            <CompanyProfileCard ticker={ticker} />
          </AnimatedContent>
        </StockSectionBoundary>

        {/* Key statistics — market cap, P/E, 52-week range, etc. */}
        <StockSectionBoundary>
          <AnimatedContent reverse={true} delay={0.12}>
            <StatisticsGrid ticker={ticker} />
          </AnimatedContent>
        </StockSectionBoundary>

        {/* Earnings — included for ETFs (some report distribution/NAV earnings) */}
        <div id="earnings" className="mb-8 scroll-mt-6">
          <StockSectionBoundary>
            <AnimatedContent reverse={true} delay={0.15}>
              <EarningsCalendar ticker={ticker} />
            </AnimatedContent>
          </StockSectionBoundary>
        </div>

        {/* Community theses */}
        <StockSectionBoundary>
          <AnimatedContent reverse={true} delay={0.2}>
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
