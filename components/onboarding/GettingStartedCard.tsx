'use client';

import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { Wallet, Eye, Sparkles, Compass, ChevronRight, type LucideIcon } from 'lucide-react';
import { HomeSection, homePanel } from '@/components/dashboard/HomeSection';
import { useAuth } from '@/hooks/use-auth';
import { useHoldings } from '@/hooks/use-holdings';
import { useWatchlist } from '@/hooks/use-watchlist';
import { useAIPanel } from '@/components/ai/AIPanelProvider';
import { cn } from '@/lib/utils';

/**
 * GettingStartedCard — the "start here" a brand-new account was missing.
 *
 * Renders only for a genuinely new user (signed in, zero holdings AND zero
 * watchlist items), in place of the portfolio section, and disappears the
 * moment they take any action. Neutral by design: nothing here spends the
 * emerald/red signal, which is reserved for gain/loss.
 */

interface Step {
  icon: LucideIcon;
  title: string;
  desc: string;
  href?: string;
  onClick?: () => void;
}

export function GettingStartedCard() {
  const { t } = useTranslation('discover');
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { data: holdings, isLoading: holdingsLoading } = useHoldings();
  const { data: watchlist, isLoading: watchlistLoading } = useWatchlist();
  const { open: openAIPanel } = useAIPanel();

  // Wait for a definitive answer before deciding — never flash the card at a
  // returning user mid-load.
  if (authLoading || holdingsLoading || watchlistLoading) return null;
  if (!isAuthenticated) return null;
  if ((holdings?.length ?? 0) > 0 || (watchlist?.length ?? 0) > 0) return null;

  const steps: Step[] = [
    { icon: Eye, title: t('getStartedWatchTitle'), desc: t('getStartedWatchDesc'), href: '/watchlist' },
    { icon: Wallet, title: t('getStartedHoldingTitle'), desc: t('getStartedHoldingDesc'), href: '/holdings' },
    { icon: Sparkles, title: t('getStartedBullTitle'), desc: t('getStartedBullDesc'), onClick: () => openAIPanel({ query: '' }) },
    { icon: Compass, title: t('getStartedExploreTitle'), desc: t('getStartedExploreDesc'), href: '/discover' },
  ];

  return (
    <HomeSection title={t('getStartedTitle')}>
      <div className={cn(homePanel, 'p-5')}>
        <p className="text-sm text-muted-foreground">{t('getStartedIntro')}</p>

        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {steps.map((step) => {
            const Icon = step.icon;
            const inner = (
              <>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors group-hover:text-foreground">
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-foreground">{step.title}</span>
                  <span className="block text-xs leading-snug text-muted-foreground">{step.desc}</span>
                </span>
                <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" aria-hidden />
              </>
            );
            const cls =
              'group flex items-start gap-3 rounded-lg border border-border/60 p-3 text-left transition-colors hover:border-border hover:bg-muted/30';

            return step.href ? (
              <Link key={step.title} href={step.href} className={cls}>
                {inner}
              </Link>
            ) : (
              <button key={step.title} type="button" onClick={step.onClick} className={cls}>
                {inner}
              </button>
            );
          })}
        </div>
      </div>
    </HomeSection>
  );
}
