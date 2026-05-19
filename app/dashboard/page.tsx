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
import { CryptoMarketCard } from '@/components/asset/CryptoMarketCard';
import Link from 'next/link';
import { Compass, ArrowRight } from 'lucide-react';

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

          {/* Explore CTA — points to the new /discover page */}
          <section className="min-w-0">
            <Link
              href="/discover"
              className="group relative block overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/[0.08] via-primary/[0.03] to-transparent p-5 hover:border-primary/40 transition-colors"
            >
              <div className="flex items-center gap-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/15 border border-primary/25 shrink-0">
                  <Compass className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-semibold text-foreground">Explore the market</h3>
                  <p className="text-sm text-muted-foreground/80 mt-0.5">
                    Browse by sector, theme, ETF, and crypto — live prices, curated rails.
                  </p>
                </div>
                <div className="flex items-center gap-1 text-sm font-medium text-primary shrink-0 group-hover:translate-x-0.5 transition-transform">
                  Open <ArrowRight className="h-4 w-4" />
                </div>
              </div>
            </Link>
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

          {/* Crypto & Commodities market overview */}
          <section className="min-w-0 overflow-hidden">
            <AnimatedContent reverse={true}>
              <CryptoMarketCard />
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
