'use client';

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { PlayCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { DemoContent } from '@/types/academy';
import { DemoTour } from './DemoTour';

// Surfaces are heavy (real stock/holdings/dividend components) — load only when
// the demo actually opens, matching ChartTourLesson's ssr:false pattern.
const StockStatsDemo = dynamic(() => import('./demo/StockStatsDemo').then((m) => m.StockStatsDemo), { ssr: false });
const PortfolioDemo = dynamic(() => import('./demo/PortfolioDemo').then((m) => m.PortfolioDemo), { ssr: false });
const DividendDemo = dynamic(() => import('./demo/DividendDemo').then((m) => m.DividendDemo), { ssr: false });
const ScreenerDemo = dynamic(() => import('./demo/ScreenerDemo').then((m) => m.ScreenerDemo), { ssr: false });
const AiResearchDemo = dynamic(() => import('./demo/AiResearchDemo').then((m) => m.AiResearchDemo), { ssr: false });
const MarketMoodDemo = dynamic(() => import('./demo/MarketMoodDemo').then((m) => m.MarketMoodDemo), { ssr: false });

interface Props {
  content: DemoContent;
  onComplete: () => void;
  /** Where "Back to course" goes when the tour is closed before the end. */
  courseHref: string;
}

/**
 * Demo-mode lesson: opens a real app surface fullscreen with a guided DemoTour.
 * Mirrors ChartTourLesson's shape — holds step/active state here, gates step
 * advancement on a surface-reported action. Only reaching the last step
 * completes it: closing or skipping used to award the full XP, so a demo could
 * be "done" without being looked at.
 */
export function DemoLesson({ content, onComplete, courseHref }: Props) {
  const { t } = useTranslation('academy');
  const [stepIndex, setStepIndex] = useState(0);
  const [active, setActive] = useState(true);
  // Set by the active surface when its step-gating action (if any) is done —
  // e.g. the dividend calculator reports 'run-calculation' once a result lands.
  const [satisfiedActions, setSatisfiedActions] = useState<Set<string>>(new Set());

  const step = content.steps[stepIndex];

  const isActionSatisfied = useMemo(() => {
    if (!step || step.requiredAction === 'none') return true;
    return satisfiedActions.has(step.requiredAction);
  }, [step, satisfiedActions]);

  const markActionSatisfied = (action: string) =>
    setSatisfiedActions((prev) => (prev.has(action) ? prev : new Set(prev).add(action)));

  const finish = () => {
    setActive(false);
    onComplete();
  };

  const [closedEarly, setClosedEarly] = useState(false);
  const leave = () => {
    setActive(false);
    setClosedEarly(true);
  };

  if (!active) {
    if (!closedEarly) return null;
    return (
      <div className="space-y-4 rounded-2xl border border-border bg-card p-5 text-center sm:p-6">
        <p className="text-sm text-muted-foreground">{t('demoLessonClosedEarly')}</p>
        <div className="grid gap-2">
          <Button
            size="lg"
            className="w-full gap-2 font-semibold"
            onClick={() => {
              setStepIndex(0);
              setClosedEarly(false);
              setActive(true);
            }}
          >
            <PlayCircle className="h-4 w-4" aria-hidden />
            {t('demoLessonRestart')}
          </Button>
          <Button asChild size="sm" variant="ghost" className="text-muted-foreground">
            <Link href={courseHref}>{t('lessonCompleteBackToCourse')}</Link>
          </Button>
        </div>
      </div>
    );
  }

  const tour = (
    <DemoTour
      steps={content.steps}
      stepIndex={stepIndex}
      onStepIndexChange={setStepIndex}
      isActionSatisfied={isActionSatisfied}
      onSkip={leave}
      onFinish={finish}
    />
  );

  switch (content.surface) {
    case 'stock-stats':
      return (
        <StockStatsDemo ticker={content.ticker} onClose={leave}>
          {tour}
        </StockStatsDemo>
      );
    case 'demo-portfolio':
      return (
        <PortfolioDemo fixtureId={content.fixtureId} onClose={leave}>
          {tour}
        </PortfolioDemo>
      );
    case 'dividend-calculator':
      return (
        <DividendDemo
          holdings={content.holdings}
          years={content.years}
          onCalculated={() => markActionSatisfied('run-calculation')}
          onClose={leave}
        >
          {tour}
        </DividendDemo>
      );
    case 'screener':
      return (
        <ScreenerDemo
          onFilterApplied={() => markActionSatisfied('apply-valuation-filter')}
          onClose={leave}
        >
          {tour}
        </ScreenerDemo>
      );
    case 'ai-research':
      return (
        <AiResearchDemo
          fixtureId={content.fixtureId}
          onResearched={() => markActionSatisfied('run-research')}
          onClose={leave}
        >
          {tour}
        </AiResearchDemo>
      );
    case 'market-mood':
      return (
        <MarketMoodDemo onClose={leave}>
          {tour}
        </MarketMoodDemo>
      );
    default:
      return null;
  }
}
