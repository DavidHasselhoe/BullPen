'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { EarningsCalendar } from '@/components/stock/EarningsCalendar';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ArrowLeft, MessageSquare, Bookmark, BookmarkCheck } from 'lucide-react';
import { useRecentlyViewed } from '@/hooks/use-recently-viewed';
import { useAIPanel } from '@/components/ai/AIPanelProvider';
import { Button } from '@/components/ui/button';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import AnimatedContent from '@/components/ui/AnimatedContent';
import { useBackground } from '@/hooks/use-background';
import { StockQuoteCard } from '@/components/stock/StockQuoteCard';
import { useIsWatched, useAddToWatchlist, useRemoveFromWatchlist } from '@/hooks/use-watchlist';
import { ThesisSection } from '@/components/social/ThesisSection';
import { useStockSnapshot } from '@/hooks/use-stock-snapshot';
import dynamic from 'next/dynamic';
import type { Company } from '@/lib/types/database';

const PriceChart = dynamic(
  () => import('@/components/stock/PriceChart').then((m) => ({ default: m.PriceChart })),
  { ssr: false, loading: () => <div className="mb-8 h-[400px] animate-pulse rounded-xl bg-muted" /> }
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

  const isWatched = useIsWatched(ticker);
  const addToWatchlist = useAddToWatchlist();
  const removeFromWatchlist = useRemoveFromWatchlist();

  // Batch-fetch quote + statistics + earnings in one TwelveData /batch call,
  // then seed each component's individual query cache so they skip extra requests.
  useStockSnapshot(ticker);

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
    setAIContext({ tickers: [ticker], label: company?.name ?? ticker });
    return () => setAIContext(null);
  }, [ticker, company?.name, setAIContext]);

  useEffect(() => {
    if (company?.ticker && company?.name) {
      addRecentlyViewed(company.ticker, company.name, company.logo_url);
    }
  }, [company?.ticker, company?.name, company?.logo_url, addRecentlyViewed]);

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

        {/* Company header loading skeleton */}
        {companyLoading && !company && (
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
        {company && (
          <AnimatedContent reverse={true}>
            <Card className="mb-8">
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <CompanyLogo
                        name={company.name}
                        ticker={company.ticker}
                        logoUrl={company.logo_url}
                        size={64}
                      />
                      <div>
                        <h1 className="text-3xl font-semibold text-foreground">{company.name}</h1>
                        <div className="mt-1 flex items-center gap-2">
                          <Badge variant="outline" className="font-mono text-sm">
                            {company.ticker}
                          </Badge>
                          {company.sector && (
                            <span className="text-sm text-muted-foreground">
                              {company.sector}
                              {company.industry && ` • ${company.industry}`}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      variant={isWatched ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => {
                        if (!ticker) return;
                        if (isWatched) {
                          removeFromWatchlist.mutate(ticker);
                        } else {
                          addToWatchlist.mutate({ symbol: ticker, company_name: company?.name ?? ticker });
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
              {company.description && (
                <CardContent>
                  <Separator className="mb-4" />
                  <p className="text-sm leading-relaxed text-muted-foreground">{company.description}</p>
                </CardContent>
              )}
            </Card>
          </AnimatedContent>
        )}

        {/* Live quote */}
        {company && (
          <AnimatedContent reverse={true} delay={0.05}>
            <div className="mb-8">
              <StockQuoteCard ticker={ticker} />
            </div>
          </AnimatedContent>
        )}

        {/* Price chart */}
        {company && (
          <AnimatedContent reverse={true} delay={0.1}>
            <PriceChart ticker={ticker} />
          </AnimatedContent>
        )}

        {/* Company Profile (description, executives, facts) */}
        {company && (
          <AnimatedContent reverse={true} delay={0.12}>
            <CompanyProfileCard ticker={ticker} />
          </AnimatedContent>
        )}

        {/* Statistics */}
        {company && (
          <AnimatedContent reverse={true} delay={0.15}>
            <StatisticsGrid ticker={ticker} />
          </AnimatedContent>
        )}

        {/* Financials */}
        {company && (
          <AnimatedContent reverse={true} delay={0.2}>
            <FinancialsSection ticker={ticker} />
          </AnimatedContent>
        )}

        {/* Earnings calendar */}
        <div id="earnings" className="mb-8 scroll-mt-6">
          <AnimatedContent reverse={true} delay={0.15}>
            <EarningsCalendar ticker={ticker} />
          </AnimatedContent>
        </div>

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
