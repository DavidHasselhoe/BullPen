'use client';

import { Pencil } from 'lucide-react';
import { HomepageRedirect } from '@/components/navigation/HomepageRedirect';
import { CommandBar } from '@/components/command-palette/CommandBar';
import { WelcomeMessage } from '@/components/ui/WelcomeMessage';
import AnimatedContent from '@/components/ui/AnimatedContent';
import { Button } from '@/components/ui/button';
import { useBackground } from '@/hooks/use-background';
import { MarketContextSection } from '@/components/market/MarketContextSection';
import { HotPicksCard } from '@/components/discover/HotPicksCard';
import { RecentlyViewedInline } from '@/components/discover/RecentlyViewedInline';
import { PortfolioSummaryWidget } from '@/components/discover/PortfolioSummaryWidget';
import { EarningsCalendarWidget } from '@/components/discover/EarningsCalendarWidget';
import { DailyBriefWidget } from '@/components/discover/DailyBriefWidget';
import { WhyTodayWidget } from '@/components/discover/WhyTodayWidget';
import { QuoteDisplay } from '@/components/ui/QuoteDisplay';
import { useUserSettings } from '@/hooks/use-user-settings';
import { CryptoMarketCard } from '@/components/asset/CryptoMarketCard';
import { GettingStartedCard } from '@/components/onboarding/GettingStartedCard';
import { PerformanceCalendarWidget } from '@/components/discover/PerformanceCalendarWidget';
import { resolveWidgetOrder } from '@/lib/dashboard/widgets';

function WidgetSlot({ id }: { id: string }) {
  switch (id) {
    case 'recently_viewed':
      return <RecentlyViewedInline />;
    case 'performance_calendar':
      return (
        <section className="min-w-0 overflow-hidden">
          <AnimatedContent reverse={true}>
            <PerformanceCalendarWidget />
          </AnimatedContent>
        </section>
      );
    case 'daily_brief':
      return (
        <section className="min-w-0 overflow-hidden">
          <AnimatedContent reverse={true}>
            <DailyBriefWidget />
          </AnimatedContent>
        </section>
      );
    case 'why_today':
      return (
        <section className="min-w-0 overflow-hidden">
          <AnimatedContent reverse={true}>
            <WhyTodayWidget />
          </AnimatedContent>
        </section>
      );
    case 'market_context':
      return <MarketContextSection />;
    case 'earnings_calendar':
      return (
        <section className="min-w-0 overflow-hidden">
          <AnimatedContent reverse={true}>
            <EarningsCalendarWidget />
          </AnimatedContent>
        </section>
      );
    case 'hot_picks':
      return (
        <section className="min-w-0 overflow-hidden">
          <AnimatedContent reverse={true}>
            <HotPicksCard />
          </AnimatedContent>
        </section>
      );
    case 'crypto_market':
      return (
        <section className="min-w-0 overflow-hidden">
          <AnimatedContent reverse={true}>
            <CryptoMarketCard />
          </AnimatedContent>
        </section>
      );
    case 'investing_quote':
      return (
        <footer className="min-w-0">
          <QuoteDisplay enabled />
        </footer>
      );
    default:
      return null;
  }
}

export default function DiscoverPage() {
  const { hasAnimatedBackground } = useBackground();
  const { showWelcomeText, homepageWidgetOrder, homepageWidgetHidden } = useUserSettings();

  const resolvedOrder = resolveWidgetOrder(homepageWidgetOrder, homepageWidgetHidden);

  const openCustomize = () => {
    window.dispatchEvent(new CustomEvent('settings:open', { detail: { tab: 'customize' } }));
  };

  return (
    <HomepageRedirect>
    <div className={`min-h-screen ${hasAnimatedBackground ? '' : 'bg-background'}`}>
      <main className="container mx-auto max-w-6xl py-8 px-4 sm:px-6 lg:px-8 min-w-0 page-enter">
        {/* SECTION: Search / Command bar — fixed header, not reorderable */}
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
          </div>
        </section>

        {/* Customize control */}
        <div className="flex justify-end mb-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={openCustomize}
            className="gap-1.5 h-7 px-2 text-xs text-muted-foreground/80 hover:text-foreground"
          >
            <Pencil className="h-3 w-3" />
            Customize
          </Button>
        </div>

        {/* Getting-started card — self-hides once the user has any holding or
            watchlist item, so it only greets genuinely new accounts. */}
        <div className="mb-16">
          <AnimatedContent reverse={true}>
            <GettingStartedCard />
          </AnimatedContent>
        </div>

        {/* Reorderable widget stack */}
        <div className="space-y-16">
          {resolvedOrder.map((id) => (
            <WidgetSlot key={id} id={id} />
          ))}
        </div>
      </main>
    </div>
    </HomepageRedirect>
  );
}
