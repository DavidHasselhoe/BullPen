'use client';

import { HomepageRedirect } from '@/components/navigation/HomepageRedirect';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { CommandBar } from '@/components/command-palette/CommandBar';
import { FundamentalChangeCard } from '@/components/discover/FundamentalChangeCard';
import { RecentFilingsList } from '@/components/discover/RecentFilingsList';
import { CompaniesToWatchList } from '@/components/discover/CompaniesToWatchList';
import {
  useFundamentalChanges,
  useRecentFilings,
  useCompaniesToWatch,
} from '@/hooks/use-discover';
import { WelcomeMessage } from '@/components/ui/WelcomeMessage';
import AnimatedContent from '@/components/ui/AnimatedContent';
import { useBackground } from '@/hooks/use-background';
import { TopMoversCard } from '@/components/market/TopMoversCard';
import { MarketNewsCard } from '@/components/market/MarketNewsCard';
import { MarketHoursCard } from '@/components/market/MarketHoursCard';
import { useTopMovers, useMarketNews } from '@/hooks/use-market-data';
import { HotPicksCard } from '@/components/discover/HotPicksCard';
import { RecentlyViewedInline } from '@/components/discover/RecentlyViewedInline';
import { KeyInsightsRow } from '@/components/discover/KeyInsightsRow';
import { QuoteDisplay } from '@/components/ui/QuoteDisplay';
import { useUserSettings } from '@/hooks/use-user-settings';

export default function DiscoverPage() {
  const {
    data: fundamentalChanges,
    isLoading: isLoadingChanges,
  } = useFundamentalChanges(6);

  const {
    data: recentFilings,
    isLoading: isLoadingFilings,
  } = useRecentFilings(10);

  const {
    data: companiesToWatch,
    isLoading: isLoadingCompanies,
  } = useCompaniesToWatch(10);

  const {
    data: topMovers,
    isLoading: isLoadingMovers,
  } = useTopMovers(5);

  const {
    data: marketNews,
    isLoading: isLoadingNews,
  } = useMarketNews('general', 5);

  const { hasAnimatedBackground } = useBackground();
  const { showQuotes, showWelcomeText } = useUserSettings();

  return (
    <HomepageRedirect>
    <div className={`min-h-screen ${hasAnimatedBackground ? '' : 'bg-background'}`}>
      <main className="container mx-auto max-w-6xl py-8 px-4 sm:px-6 lg:px-8 min-w-0">
        {/* SECTION: Search / Command bar */}
        <section className="mb-10">
          <div className="flex flex-col gap-4">
            {showWelcomeText && <WelcomeMessage />}
            <AnimatedContent reverse={true}>
              <CommandBar />
            </AnimatedContent>
            <RecentlyViewedInline />
          </div>
        </section>

        <div className="space-y-16">
          {/* SECTION 1: Market Context - Hours, movers, news */}
          <section className="space-y-4 min-w-0 overflow-hidden">
            <h2 className="text-base font-bold uppercase tracking-wider text-foreground">
              Market Context
            </h2>
            <p className="text-sm text-muted-foreground max-w-2xl">
              Market hours, top movers, and recent news.
            </p>
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 min-w-0">
              <AnimatedContent reverse={true} className="min-w-0">
                <MarketHoursCard exchangeCodes={['NYSE', 'NASDAQ', 'LSE', 'OSE', 'XETRA', 'STO']} />
              </AnimatedContent>
              <AnimatedContent reverse={true} delay={0.05} className="min-w-0">
                <TopMoversCard
                  gainers={topMovers?.gainers || []}
                  losers={topMovers?.losers || []}
                  isLoading={isLoadingMovers}
                />
              </AnimatedContent>
              <AnimatedContent reverse={true} delay={0.1} className="min-w-0">
                <MarketNewsCard
                  news={marketNews || []}
                  isLoading={isLoadingNews}
                  limit={5}
                />
              </AnimatedContent>
            </div>
          </section>

          <Separator className="opacity-60" />

          {/* SECTION 2: Key Insights - AI-discovered financial insights */}
          <section className="space-y-4 min-w-0 overflow-hidden">
            <h2 className="text-base font-bold uppercase tracking-wider text-foreground">
              Key Insights
            </h2>
            <p className="text-sm text-muted-foreground max-w-2xl">
              AI-discovered signals from SEC filings: growth acceleration, margin expansion, revenue deceleration.
            </p>
            <KeyInsightsRow changes={fundamentalChanges} isLoading={isLoadingChanges} />
          </section>

          <Separator className="opacity-60" />

          {/* SECTION 3: Fundamental Changes - Detected SEC filing signals */}
          <section className="space-y-4 min-w-0 overflow-hidden">
            <h2 className="text-base font-bold uppercase tracking-wider text-foreground">
              Fundamental Changes
            </h2>
            <p className="text-sm text-muted-foreground max-w-2xl">
              Signals detected from recent SEC filings: sustained trends, acceleration, margin changes.
            </p>
            {isLoadingChanges ? (
              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 min-w-0">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <Card key={i} className="border-border/50 min-w-0">
                    <CardContent className="p-5">
                      <div className="space-y-3">
                        <Skeleton className="h-5 w-32" />
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-16 w-full" />
                        <Skeleton className="h-3 w-20" />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : !fundamentalChanges || fundamentalChanges.length === 0 ? (
              <Card className="border-border/50">
                <CardContent className="p-6 py-8 text-center">
                  <p className="text-sm text-muted-foreground">
                    No recent signals. New filings will appear as they are analyzed.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 min-w-0">
                {fundamentalChanges.slice(0, 6).map((change, index) => (
                  <AnimatedContent
                    key={`${change.type}-${change.company.id}-${change.trend?.id || change.signal?.id}`}
                    reverse={true}
                    delay={index * 0.05}
                    className="min-w-0"
                  >
                    <FundamentalChangeCard change={change} />
                  </AnimatedContent>
                ))}
              </div>
            )}
          </section>

          <Separator className="opacity-60" />

          {/* Hot Picks */}
          <section className="min-w-0 overflow-hidden">
            <AnimatedContent reverse={true}>
              <HotPicksCard />
            </AnimatedContent>
          </section>

          <Separator className="opacity-60" />

          {/* Recently Analyzed Filings */}
          <section className="min-w-0 overflow-hidden">
            <h2 className="mb-5 text-base font-bold uppercase tracking-wider text-foreground">
              Recent Filings
            </h2>
            <Card className="border-border/50 min-w-0 overflow-hidden">
              <CardContent className="p-6">
                <RecentFilingsList
                  filings={recentFilings}
                  isLoading={isLoadingFilings}
                />
              </CardContent>
            </Card>
          </section>

          <Separator className="opacity-60" />

          {/* Companies to Watch */}
          <section className="min-w-0 overflow-hidden">
            <h2 className="mb-5 text-base font-bold uppercase tracking-wider text-foreground">
              Companies to Watch
            </h2>
            <Card className="border-border/50 min-w-0 overflow-hidden">
              <CardContent className="p-6">
                <CompaniesToWatchList
                  companies={companiesToWatch}
                  isLoading={isLoadingCompanies}
                />
              </CardContent>
            </Card>
          </section>

          {showQuotes && (
            <footer className="pt-4">
              <QuoteDisplay enabled={showQuotes} />
            </footer>
          )}
        </div>
      </main>
    </div>
    </HomepageRedirect>
  );
}
