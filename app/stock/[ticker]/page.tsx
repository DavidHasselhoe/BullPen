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
import { ArrowLeft, MessageSquare, SearchX, Telescope } from 'lucide-react';
import { AlertDialog } from '@/components/alerts/AlertDialog';
import Link from 'next/link';
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
import { StockNavSidebar, type StockNavSection } from '@/components/stock/StockNavSidebar';
import { slugToSymbol, inferAssetType, hasFinancials } from '@/lib/assets/asset-type';

const StockPricePanel = dynamic(
  () => import('@/components/stock/StockPricePanel').then((m) => ({ default: m.StockPricePanel })),
  { ssr: false, loading: () => <div className="mb-8 h-[340px] animate-shimmer rounded-2xl" /> }
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
  const { i18n } = useTranslation();
  const rawTicker = (params.ticker as string) ?? '';
  const ticker = rawTicker.toUpperCase();

  // Redirect crypto/commodity slugs to the universal asset page,
  // and redirect ETFs (detected from snapshot) to the canonical /etf/ route.
  useEffect(() => {
    if (!rawTicker) return;
    const sym = slugToSymbol(ticker);
    const type = inferAssetType(sym);
    if (type !== 'stock' && type !== 'etf' && type !== 'unknown') {
      router.replace(`/asset/${ticker}`);
    }
  }, [rawTicker, ticker, router]);

  const { hasAnimatedBackground } = useBackground();
  const { add: addRecentlyViewed } = useRecentlyViewed();
  const { open: openAIPanel, setAIContext } = useAIPanel();

  // Signals flow: HealthScoreCard → signals state → StatisticsGrid (no extra fetch needed)
  const [metricSignals, setMetricSignals] = useState<Record<string, SignalValue> | undefined>(undefined);

  // Batch-fetch quote + statistics + earnings in one TwelveData /batch call,
  // then seed each component's individual query cache so they skip extra requests.
  const snapshot = useStockSnapshot(ticker);

  // Derive asset type once the snapshot resolves (quote response includes instrument_type).
  // While loading, treat type as 'unknown' so ETF-irrelevant sections stay unmounted.
  // After loading, fall back to 'stock' if instrumentType is absent — /stock/[ticker]
  // routing has already screened out crypto/commodity, so this is a safe assumption.
  const snapshotAssetType = snapshot.data?.instrumentType
    ? inferAssetType(ticker, snapshot.data.instrumentType)
    : snapshot.isLoading
      ? 'unknown'
      : 'stock';
  const isEtf = snapshotAssetType === 'etf';
  const showFundamentals = !snapshot.isLoading && !isEtf && hasFinancials(snapshotAssetType);

  // Once the snapshot confirms an ETF, hand off to the dedicated /etf/ route.
  useEffect(() => {
    if (isEtf) router.replace(`/etf/${ticker}`);
  }, [isEtf, ticker, router]);

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

  // Fire-and-forget: check TwelveData last_changes (1 credit, throttled 1×/hr)
  // to expire any cached fundamental data that has actually been updated.
  // Runs after mount so it never blocks the initial render.
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

  // Fetch TwelveData profile for the short/common company name.
  // Key matches CompanyProfileCard so both share the same cache entry.
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
      const instrType = snapshotAssetType !== 'unknown' ? snapshotAssetType : undefined;
      addRecentlyViewed(company.ticker, displayName, company.logo_url, instrType);
    }
  }, [company?.ticker, displayName, company?.logo_url, snapshotAssetType, addRecentlyViewed]);

  // All three data sources have settled and none knows this ticker → show 404
  const isNotFound =
    !companyLoading && !profileLoading && !snapshot.isLoading &&
    company === null &&
    profileData !== undefined &&
    !profileData?.profile &&
    !snapshot.data?.success;

  const navSections: StockNavSection[] = [
    { id: 'nav-overview',    label: 'Overview' },
    { id: 'nav-profile',     label: 'Profile' },
    ...(showFundamentals ? [{ id: 'nav-health', label: 'Health Score' }] : []),
    { id: 'nav-statistics',  label: 'Statistics' },
    ...(showFundamentals ? [
      { id: 'nav-financials', label: 'Financials' },
      { id: 'nav-revenue',    label: 'Revenue' },
      { id: 'nav-earnings',   label: 'Earnings' },
      { id: 'nav-insiders',   label: 'Insiders' },
    ] : []),
    { id: 'nav-community', label: 'Community' },
  ];

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
            <Button className="mt-6" onClick={() => router.push('/dashboard')}>
              Back to Dashboard
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${hasAnimatedBackground ? '' : 'bg-background'}`}>
      <div className="mx-auto max-w-[1520px] px-4 py-8 sm:px-6 lg:px-8">

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

        <div className="xl:grid xl:grid-cols-[160px_1fr] xl:gap-8 items-start">

          {/* Left nav — sticky, hidden below xl */}
          <aside className="hidden xl:block sticky top-20 self-start pt-1">
            <StockNavSidebar sections={navSections} />
          </aside>

          {/* Main content */}
          <div className="min-w-0">

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

            {/* Company header */}
            <div id="nav-overview" className="scroll-mt-20">
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
                          <AlertDialog symbol={ticker} companyName={displayName} />
                          <Button variant="outline" size="sm" onClick={() => openAIPanel()} className="gap-2">
                            <MessageSquare className="h-4 w-4" />
                            Ask AI
                          </Button>
                          {showFundamentals && (
                            <Button asChild size="sm" className="gap-2">
                              <Link href={`/tools/deep-dive/${ticker}`}>
                                <Telescope className="h-4 w-4" />
                                Deep Dive
                              </Link>
                            </Button>
                          )}
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
            </div>

            {/* Company Profile (TwelveData: description, executives, facts) */}
            <div id="nav-profile" className="scroll-mt-20">
              <StockSectionBoundary>
                <AnimatedContent reverse={true} delay={0.08}>
                  <CompanyProfileCard ticker={ticker} />
                </AnimatedContent>
              </StockSectionBoundary>
            </div>

            {/* Financial Health Score — only for stocks with financials */}
            {showFundamentals && (
              <div id="nav-health" className="scroll-mt-20">
                <StockSectionBoundary>
                  <AnimatedContent reverse={true} delay={0.12}>
                    <HealthScoreCard ticker={ticker} onSignalsReady={setMetricSignals} />
                  </AnimatedContent>
                </StockSectionBoundary>
              </div>
            )}

            {/* Statistics (TwelveData) — available for both stocks and ETFs */}
            <div id="nav-statistics" className="scroll-mt-20">
              <StockSectionBoundary>
                <AnimatedContent reverse={true} delay={0.15}>
                  <StatisticsGrid ticker={ticker} signals={metricSignals} />
                </AnimatedContent>
              </StockSectionBoundary>
            </div>

            {/* Financials, Sankey, Earnings, Insiders — stocks only */}
            {showFundamentals && (
              <>
                <div id="nav-financials" className="scroll-mt-20">
                  <StockSectionBoundary>
                    <AnimatedContent reverse={true} delay={0.2}>
                      <FinancialsSection ticker={ticker} />
                    </AnimatedContent>
                  </StockSectionBoundary>
                </div>

                <div id="nav-revenue" className="scroll-mt-20">
                  <StockSectionBoundary>
                    <AnimatedContent reverse={true} delay={0.22}>
                      <SankeyCard ticker={ticker} />
                    </AnimatedContent>
                  </StockSectionBoundary>
                </div>

                <div id="nav-earnings" className="scroll-mt-20">
                  <StockSectionBoundary>
                    <AnimatedContent reverse={true} delay={0.24}>
                      <EarningsCalendar ticker={ticker} />
                    </AnimatedContent>
                  </StockSectionBoundary>
                </div>

                <div id="nav-insiders" className="scroll-mt-20">
                  <StockSectionBoundary>
                    <AnimatedContent reverse={true} delay={0.26}>
                      <InsiderTransactionsCard ticker={ticker} />
                    </AnimatedContent>
                  </StockSectionBoundary>
                </div>
              </>
            )}

            {/* Community theses */}
            <div id="nav-community" className="scroll-mt-20">
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
        </div>
      </div>
    </div>
  );
}
