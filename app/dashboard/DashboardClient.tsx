'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight, SlidersHorizontal } from 'lucide-react';
import { HomepageRedirect } from '@/components/navigation/HomepageRedirect';
import type { InitialWelcome } from '@/lib/dashboard/greeting';
import type { IndexQuote } from '@/lib/discover/discover-config';
import { useBackground } from '@/hooks/use-background';
import { useUserSettings } from '@/hooks/use-user-settings';
import { useHomePortfolio } from '@/hooks/use-home-portfolio';
import { useAuth } from '@/hooks/use-auth';
import { HomeHeader } from '@/components/dashboard/HomeHeader';
import { PortfolioHero } from '@/components/dashboard/PortfolioHero';
import { ComingUp } from '@/components/dashboard/ComingUp';
import { YourNews } from '@/components/dashboard/YourNews';
import { PickUp } from '@/components/dashboard/PickUp';
import { DailyBriefWidget } from '@/components/discover/DailyBriefWidget';
import { StarterPicker } from '@/components/dashboard/StarterPicker';
import { TrialStartedModal } from '@/components/billing/TrialStartedModal';
import { resolveWidgetOrder } from '@/lib/dashboard/widgets';

function WidgetSlot({ id }: { id: string }) {
  switch (id) {
    case 'daily_brief':
      return <DailyBriefWidget />;
    case 'coming_up':
      return <ComingUp />;
    case 'your_news':
      return <YourNews />;
    case 'pick_up':
      return <PickUp />;
    default:
      return null;
  }
}

/**
 * Home answers three questions in order: am I okay (greeting sentence and
 * portfolio), what do I need to know today (brief, what's coming up for my
 * stocks, their news), and where was I (recents, Academy). It ends, on
 * purpose: "all caught up" is the signal that the check-in is done. The wider
 * market lives on Discover.
 */
export default function DashboardClient({
  initialWelcome,
  indices,
}: {
  initialWelcome?: InitialWelcome | null;
  indices: IndexQuote[];
}) {
  const { t } = useTranslation('discover');
  const { hasAnimatedBackground } = useBackground();
  const { showWelcomeText, homepageWidgetOrder, homepageWidgetHidden } = useUserSettings();
  const { isNew } = useHomePortfolio();
  const { isAuthenticated } = useAuth();
  // The first tap makes the account not-new; keep the picker until they say Done.
  const [picking, setPicking] = useState(false);

  const order = resolveWidgetOrder(homepageWidgetOrder, homepageWidgetHidden);

  const openCustomize = () => {
    window.dispatchEvent(new CustomEvent('settings:open', { detail: { tab: 'customize' } }));
  };

  return (
    <HomepageRedirect>
      <div className={`min-h-screen ${hasAnimatedBackground ? '' : 'bg-background'}`}>
        <TrialStartedModal />
        <main className="container mx-auto min-w-0 max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
          <HomeHeader initialWelcome={initialWelcome} showWelcome={showWelcomeText !== false} indices={indices} />

          <div className="mt-8 space-y-10">
            {isNew || picking ? (
              <StarterPicker onPick={() => setPicking(true)} onDone={() => setPicking(false)} />
            ) : (
              <PortfolioHero />
            )}
            {order.map((id) => (
              <WidgetSlot key={id} id={id} />
            ))}
          </div>

          <footer className="mt-12 flex flex-col gap-4 border-t border-border/60 pt-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">{t('homeCaughtUp')}</p>
              <Link
                href="/discover"
                className="mt-1 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                {t('homeExploreMarket')}
                <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            </div>
            {isAuthenticated && (
            <button
              type="button"
              onClick={openCustomize}
              className="inline-flex items-center gap-1.5 self-start py-2 text-xs text-muted-foreground transition-colors hover:text-foreground sm:self-auto"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
              {t('homeCustomize')}
            </button>
            )}
          </footer>
        </main>
      </div>
    </HomepageRedirect>
  );
}
