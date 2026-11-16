'use client';

import Link from 'next/link';
import { useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Check } from 'lucide-react';
import { HomeSection, homePanel } from '@/components/dashboard/HomeSection';
import { useAIPanel } from '@/components/ai/AIPanelProvider';
import { useCommandPalette } from '@/components/command-palette/CommandPaletteProvider';
import { useAuth } from '@/hooks/use-auth';
import { useHoldings } from '@/hooks/use-holdings';
import { useMyStockNames } from '@/hooks/use-my-stock-names';
import { useRecentlyViewed } from '@/hooks/use-recently-viewed';
import { useAcademyStats } from '@/hooks/use-academy-stats';
import { useUserSettings } from '@/hooks/use-user-settings';
import { hasAskedBull, subscribeAskedBull } from '@/lib/ai/asked-bull';
import { trackEvent } from '@/lib/analytics/track';
import { cn } from '@/lib/utils';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * A new account's first week on Home: four things that show what BullPen
 * does, each ticked from real data (a Bull conversation, a stock page
 * opened, a holding, Academy XP), so finishing one needs no extra click.
 * Shown for 7 days after signup until hidden. It stays up once everything is
 * done, so ticking the last one doesn't make the card vanish mid-glance.
 */
export function FirstWeekChecklist() {
  const { user } = useAuth();
  const { firstWeekHidden } = useUserSettings();
  const [now] = useState(Date.now);
  const isFirstWeek = !!user?.created_at && now - Date.parse(user.created_at) < WEEK_MS;
  if (!user || !isFirstWeek || firstWeekHidden) return null;
  return <Checklist />;
}

function Checklist() {
  const { t } = useTranslation('discover');
  const { t: tAi } = useTranslation('ai');
  const { open: openBull } = useAIPanel();
  const { open: openSearch } = useCommandPalette();
  const { hideFirstWeek } = useUserSettings();
  const { user } = useAuth();
  const invests = (user?.settings as { invests?: unknown } | null | undefined)?.invests;
  const names = useMyStockNames();
  const { data: holdings, isPending: holdingsPending } = useHoldings();
  const { items: recents } = useRecentlyViewed();
  const { data: academy, isPending: academyPending } = useAcademyStats();
  const askedHere = useSyncExternalStore(subscribeAskedBull, hasAskedBull, () => false);
  const { data: conversations, isPending: conversationsPending } = useQuery({
    queryKey: ['ai-conversations-list'],
    queryFn: async () => {
      const res = await fetch('/api/ai/conversations');
      if (!res.ok) throw new Error('Failed to load chat history');
      return ((await res.json()).conversations ?? []) as unknown[];
    },
    staleTime: 5 * 60_000,
    retry: false,
  });
  const [hiding, setHiding] = useState(false);
  const [hideFailed, setHideFailed] = useState(false);

  const name = names[0];
  const bullQuestion = name ? tAi('starterPromptWhyMoving', { name }) : tAi('starterPromptGrowthStocks');

  const allTasks: { id: string; label: string; hint: string; done: boolean; action: string | (() => void) }[] = [
    {
      id: 'ask_bull',
      label: name ? t('firstWeekBull', { name }) : t('firstWeekBullAny'),
      hint: t('firstWeekBullHint'),
      done: askedHere || (conversations?.length ?? 0) > 0,
      action: () => openBull({ query: bullQuestion }),
    },
    {
      id: 'look_up',
      label: t('firstWeekLookup'),
      hint: t('firstWeekLookupHint'),
      done: recents.length > 0,
      action: () => openSearch(),
    },
    {
      id: 'holdings',
      label: t('firstWeekHoldings'),
      hint: t('firstWeekHoldingsHint'),
      done: (holdings ?? []).some((h) => (h.quantity ?? 0) > 0),
      action: '/holdings',
    },
    {
      id: 'academy',
      label: t('firstWeekAcademy'),
      hint: t('firstWeekAcademyHint'),
      // Every daily-challenge answer awards XP, so this also covers today's challenge.
      done: (academy?.totalXp ?? 0) > 0,
      action: '/academy',
    },
  ];
  // Onboarding's "Do you invest already?" (InvestStep): investors start with their real portfolio,
  // "not yet" has nothing to add. Accounts that never answered keep the default order.
  const holdingsTask = allTasks.filter((x) => x.id === 'holdings');
  const otherTasks = allTasks.filter((x) => x.id !== 'holdings');
  const tasks = invests === 'yes' ? [...holdingsTask, ...otherTasks] : invests === 'not_yet' ? otherTasks : allTasks;
  const doneCount = tasks.filter((x) => x.done).length;

  // Drawn once every source has answered: otherwise finished tasks flash as
  // unfinished and the bar jumps. A failed source counts as not done.
  if (holdingsPending || academyPending || conversationsPending) return null;

  const hide = async () => {
    setHiding(true);
    setHideFailed(false);
    trackEvent('first_week_hidden', { done: doneCount });
    try {
      await hideFirstWeek();
    } catch {
      setHideFailed(true);
      setHiding(false);
    }
  };

  return (
    <HomeSection
      title={t('firstWeekTitle')}
      aside={
        <button
          type="button"
          onClick={hide}
          disabled={hiding}
          aria-label={`${t('firstWeekHide')}: ${t('firstWeekTitle')}`}
          className="-my-2 inline-flex min-h-10 items-center px-2 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md disabled:opacity-60"
        >
          {t('firstWeekHide')}
        </button>
      }
    >
      <div className={homePanel}>
        <div className="flex items-center gap-3 px-4 pt-4 sm:px-5">
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={tasks.length}
            aria-valuenow={doneCount}
            aria-label={t('firstWeekProgress', { done: doneCount, total: tasks.length })}
            className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
          >
            <div
              className="h-full origin-left rounded-full bg-foreground/70 transition-transform duration-300 ease-out"
              style={{ transform: `scaleX(${doneCount / tasks.length})` }}
            />
          </div>
          <span aria-hidden className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {t('firstWeekProgress', { done: doneCount, total: tasks.length })}
          </span>
        </div>
        <ul className="mt-2 divide-y divide-border/60">
          {tasks.map((task) => {
            const rowClass = 'group flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-5';
            const body = (
              <>
                <span
                  aria-hidden
                  className={cn(
                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors',
                    task.done ? 'border-foreground bg-foreground text-background' : 'border-border',
                  )}
                >
                  {task.done && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn('block text-sm font-medium', task.done ? 'text-muted-foreground' : 'text-foreground')}>
                    {task.label}
                    {task.done && <span className="sr-only"> {t('firstWeekDoneSr')}</span>}
                  </span>
                  {!task.done && <span className="mt-0.5 block text-xs text-muted-foreground">{task.hint}</span>}
                </span>
                {!task.done && (
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" aria-hidden />
                )}
              </>
            );
            // A finished row is a record, not a control: tapping "Ask Bull" again would spend a question.
            if (task.done) {
              return <li key={task.id} className="flex items-center gap-3 px-4 py-3.5 sm:px-5">{body}</li>;
            }
            const track = () => trackEvent('first_week_task', { task: task.id });
            return (
              <li key={task.id}>
                {typeof task.action === 'string' ? (
                  <Link href={task.action} onClick={track} className={rowClass}>{body}</Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      track();
                      if (typeof task.action === 'function') task.action();
                    }}
                    className={rowClass}
                  >
                    {body}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
        {hideFailed && (
          <p role="alert" className="border-t border-border/60 px-4 py-3 text-xs text-destructive sm:px-5">
            {t('firstWeekHideFailed')}
          </p>
        )}
      </div>
    </HomeSection>
  );
}
