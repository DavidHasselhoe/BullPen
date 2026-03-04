'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
    <div className={`min-h-screen ${hasAnimatedBackground ? '' : 'bg-background'}`}>
      <main className="container mx-auto max-w-6xl py-8 px-4 sm:px-6 lg:px-8">
        {/* Hero: Command bar + contextual greeting */}
        <div className="mb-8">
          <div className="flex flex-col gap-4">
            {showWelcomeText && <WelcomeMessage />}
            <AnimatedContent reverse={true}>
              <CommandBar />
            </AnimatedContent>
          </div>
        </div>

        <div className="space-y-10">
          {/* Market Hours, Movers and News - primary signals */}
          <section className="space-y-5">
            <h2 className="text-base font-semibold uppercase tracking-wider text-foreground/90">
              What moved today?
            </h2>
            <div className="grid gap-4 lg:grid-cols-3">
              <AnimatedContent reverse={true}>
                <MarketHoursCard exchangeCodes={['NYSE', 'NASDAQ', 'LSE', 'OSE', 'XETRA', 'STO']} />
              </AnimatedContent>
              <AnimatedContent reverse={true} delay={0.1}>
                <TopMoversCard
                  gainers={topMovers?.gainers || []}
                  losers={topMovers?.losers || []}
                  isLoading={isLoadingMovers}
                />
              </AnimatedContent>
              <AnimatedContent reverse={true} delay={0.2}>
                <MarketNewsCard
                  news={marketNews || []}
                  isLoading={isLoadingNews}
                  limit={5}
                />
              </AnimatedContent>
            </div>
          </section>

          <Separator className="my-10 opacity-60" />

          {/* Hot Picks */}
          <section>
            <AnimatedContent reverse={true}>
              <HotPicksCard />
            </AnimatedContent>
          </section>

          <Separator className="my-10 opacity-60" />

          {/* AI Filing Signals */}
          <section>
            <h2 className="mb-5 text-base font-semibold uppercase tracking-wider text-foreground/90">
              What fundamentally changed?
            </h2>
            {isLoadingChanges ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <Card key={i} className="border-border/50">
                    <CardContent className="p-4">
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
                <CardContent className="py-8 text-center">
                  <p className="text-sm text-muted-foreground">
                    No recent signals. New filings will appear as they are analyzed.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {fundamentalChanges.slice(0, 6).map((change, index) => (
                  <AnimatedContent
                    key={`${change.type}-${change.company.id}-${change.trend?.id || change.signal?.id}`}
                    reverse={true}
                    delay={index * 0.1}
                  >
                    <FundamentalChangeCard change={change} />
                  </AnimatedContent>
                ))}
              </div>
            )}
          </section>

          <Separator className="my-10 opacity-60" />

          {/* Recently Analyzed Filings */}
          <section>
            <h2 className="mb-5 text-base font-semibold uppercase tracking-wider text-foreground/90">
              What companies filed new reports?
            </h2>
            {!isLoadingFilings && recentFilings && recentFilings.length > 0 ? (
              <AnimatedContent reverse={true}>
                <Card className="border-border/50">
                  <CardContent className="p-6">
                    <RecentFilingsList
                      filings={recentFilings}
                      isLoading={isLoadingFilings}
                    />
                  </CardContent>
                </Card>
              </AnimatedContent>
            ) : (
              <Card className="border-border/50">
                <CardContent className="p-6">
                  <RecentFilingsList
                    filings={recentFilings}
                    isLoading={isLoadingFilings}
                  />
                </CardContent>
              </Card>
            )}
          </section>

          <Separator className="my-10 opacity-60" />

          {/* Companies to Watch */}
          <section>
            <h2 className="mb-5 text-base font-semibold uppercase tracking-wider text-foreground/90">
              What should I monitor?
            </h2>
            {!isLoadingCompanies && companiesToWatch && companiesToWatch.length > 0 ? (
              <AnimatedContent reverse={true}>
                <Card className="border-border/50">
                  <CardContent className="p-6">
                    <CompaniesToWatchList
                      companies={companiesToWatch}
                      isLoading={isLoadingCompanies}
                    />
                  </CardContent>
                </Card>
              </AnimatedContent>
            ) : (
              <Card className="border-border/50">
                <CardContent className="p-6">
                  <CompaniesToWatchList
                    companies={companiesToWatch}
                    isLoading={isLoadingCompanies}
                  />
                </CardContent>
              </Card>
            )}
          </section>

          {showQuotes && (
            <footer className="pt-4">
              <QuoteDisplay enabled={showQuotes} />
            </footer>
          )}
        </div>
      </main>
    </div>
  );
}
