'use client';

import { HomepageRedirect } from '@/components/navigation/HomepageRedirect';
import { CommandBar } from '@/components/command-palette/CommandBar';
import { WelcomeMessage } from '@/components/ui/WelcomeMessage';
import AnimatedContent from '@/components/ui/AnimatedContent';
import { useBackground } from '@/hooks/use-background';
import { MarketContextSection } from '@/components/market/MarketContextSection';
import { HotPicksCard } from '@/components/discover/HotPicksCard';
import { RecentlyViewedInline } from '@/components/discover/RecentlyViewedInline';
import { PortfolioSummaryWidget } from '@/components/discover/PortfolioSummaryWidget';
import { EarningsCalendarWidget } from '@/components/discover/EarningsCalendarWidget';
import { DailyBriefWidget } from '@/components/discover/DailyBriefWidget';
import { QuoteDisplay } from '@/components/ui/QuoteDisplay';
import { useUserSettings } from '@/hooks/use-user-settings';

export default function DiscoverPage() {
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
            <div className="flex flex-col sm:flex-row gap-4 items-stretch">
              <div className="flex-1 min-w-0">
                <AnimatedContent reverse={true}>
                  <CommandBar />
                </AnimatedContent>
              </div>
              <div className="sm:w-72 shrink-0">
                <PortfolioSummaryWidget />
              </div>
            </div>
            <RecentlyViewedInline />
          </div>
        </section>

        <div className="space-y-16">
          {/* Daily Brief — AI-generated daily market summary (pro users) */}
          <section className="min-w-0 overflow-hidden">
            <AnimatedContent reverse={true}>
              <DailyBriefWidget />
            </AnimatedContent>
          </section>

          {/* SECTION 1: Market Context — live movers, hours, news */}
          <MarketContextSection />

          {/* Earnings Calendar — switches between all-markets and portfolio mode */}
          <section className="min-w-0 overflow-hidden">
            <AnimatedContent reverse={true}>
              <EarningsCalendarWidget />
            </AnimatedContent>
          </section>

          {/* Hot Picks */}
          <section className="min-w-0 overflow-hidden">
            <AnimatedContent reverse={true}>
              <HotPicksCard />
            </AnimatedContent>
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
