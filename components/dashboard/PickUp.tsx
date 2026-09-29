'use client';

import Link from 'next/link';
import { useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight, GraduationCap } from 'lucide-react';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import { HomeSection, homePanel } from '@/components/dashboard/HomeSection';
import { useRecentlyViewed } from '@/hooks/use-recently-viewed';
import { useRecentlyViewedQuotes } from '@/hooks/use-recently-viewed-quotes';
import { useAcademyStats } from '@/hooks/use-academy-stats';
import { useDailyChallenge } from '@/hooks/use-daily-challenge';
import { slugToAssetPath } from '@/lib/assets/asset-type';
import { cn } from '@/lib/utils';

// Recently viewed lives in localStorage: server renders nothing, client fills in.
const noop = () => () => {};
const useIsClient = () => useSyncExternalStore(noop, () => true, () => false);

/**
 * "Continue where you left off": the pages this person opened last, and the
 * Academy habit (today's challenge, the streak it keeps alive).
 */
export function PickUp() {
  const { t } = useTranslation('discover');
  const isClient = useIsClient();
  const { items } = useRecentlyViewed();
  const { data: quotes } = useRecentlyViewedQuotes(items.map((i) => i.ticker));
  const { data: stats } = useAcademyStats();
  const { data: daily } = useDailyChallenge();

  const recents = isClient ? items.slice(0, 8) : [];
  const streak = stats?.currentStreak ?? 0;
  const hasChallenge = !!daily?.challenge;
  if (recents.length === 0 && !hasChallenge) return null;

  const academyLine = daily?.alreadyDoneToday
    ? streak > 1 ? t('homeAcademyDoneStreak', { count: streak }) : t('homeAcademyDone')
    : streak > 1 ? t('homeAcademyTodoStreak', { count: streak }) : t('homeAcademyTodo');

  return (
    <HomeSection title={t('homePickUpTitle')}>
      <div className={cn(homePanel, 'divide-y divide-border/60')}>
        {recents.length > 0 && (
          <div className="flex flex-wrap gap-2 p-4 sm:px-5">
            {recents.map((item) => {
              const pct = quotes?.[item.ticker]?.changePercent;
              const up = (pct ?? 0) >= 0;
              return (
                <Link
                  key={item.ticker}
                  href={slugToAssetPath(item.ticker, item.instrument_type)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border/60 px-2.5 py-1 text-xs font-semibold text-foreground/80 transition-colors hover:border-border hover:bg-muted/40 hover:text-foreground"
                >
                  <CompanyLogo name={item.name} ticker={item.ticker} logoUrl={item.logo_url ?? null} size={14} />
                  {item.ticker}
                  {pct !== undefined && (
                    <span className={cn('font-mono tabular-nums', up ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
                      {up ? '+' : '−'}{Math.abs(pct).toFixed(2)}%
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        )}
        {hasChallenge && (
          <Link href="/academy" className="group flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-muted/40 sm:px-5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <GraduationCap className="h-4 w-4" aria-hidden />
            </span>
            <span className="min-w-0 flex-1 text-sm text-foreground">{academyLine}</span>
            <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" aria-hidden />
          </Link>
        )}
      </div>
    </HomeSection>
  );
}
