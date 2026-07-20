'use client';

import Link from 'next/link';
import { Wallet, Eye, Sparkles, Compass, ChevronRight, type LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/hooks/use-auth';
import { useHoldings } from '@/hooks/use-holdings';
import { useWatchlist } from '@/hooks/use-watchlist';
import { useAIPanel } from '@/components/ai/AIPanelProvider';

/**
 * GettingStartedCard — the "start here" a brand-new account was missing.
 *
 * Consolidates the first path into one clear card: it renders only for a
 * genuinely new user (signed in, zero holdings AND zero watchlist items) and
 * auto-hides the moment they take any action — no extra persistence, and no
 * competing with the floating starter-ticker prompt since this is an inline
 * card in the widget stack, not an overlay. Neutral by design: nothing here
 * spends the emerald/red signal, which is reserved for gain/loss.
 */

interface Step {
  icon: LucideIcon;
  title: string;
  desc: string;
  href?: string;
  onClick?: () => void;
}

export function GettingStartedCard() {
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
    {
      icon: Wallet,
      title: 'Add your first holding',
      desc: 'Track what you own and see live gains, losses, and health.',
      href: '/holdings',
    },
    {
      icon: Eye,
      title: 'Start a watchlist',
      desc: 'Follow stocks you’re curious about — no money required.',
      href: '/watchlist',
    },
    {
      icon: Sparkles,
      title: 'Ask Bull anything',
      desc: 'Get plain-language answers about any stock or metric.',
      onClick: () => openAIPanel({ query: '' }),
    },
    {
      icon: Compass,
      title: 'Explore the market',
      desc: 'Browse trending stocks, sectors, crypto, and more.',
      href: '/discover',
    },
  ];

  return (
    <Card>
      <CardContent className="p-5 sm:p-6">
        <p className="text-sm font-semibold text-foreground">New here? Start with one of these</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          A few first steps to make BullPen yours. This card disappears once you get going.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {steps.map((step) => {
            const Icon = step.icon;
            const inner = (
              <>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors group-hover:text-foreground">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-foreground">{step.title}</span>
                  <span className="block text-xs leading-snug text-muted-foreground">{step.desc}</span>
                </span>
                <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/50 transition-colors group-hover:text-foreground" />
              </>
            );
            const cls =
              'group flex items-start gap-3 rounded-xl border border-border/60 p-3 text-left transition-colors hover:border-border hover:bg-muted/30';

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
      </CardContent>
    </Card>
  );
}
