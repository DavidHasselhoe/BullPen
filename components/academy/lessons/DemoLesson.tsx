'use client';

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import type { DemoContent } from '@/types/academy';
import { DemoTour } from './DemoTour';

// Surfaces are heavy (real stock/holdings/dividend components) — load only when
// the demo actually opens, matching ChartTourLesson's ssr:false pattern.
const StockStatsDemo = dynamic(() => import('./demo/StockStatsDemo').then((m) => m.StockStatsDemo), { ssr: false });
const PortfolioDemo = dynamic(() => import('./demo/PortfolioDemo').then((m) => m.PortfolioDemo), { ssr: false });
const DividendDemo = dynamic(() => import('./demo/DividendDemo').then((m) => m.DividendDemo), { ssr: false });

interface Props {
  content: DemoContent;
  onComplete: () => void;
}

/**
 * Demo-mode lesson: opens a real app surface fullscreen with a guided DemoTour.
 * Mirrors ChartTourLesson's shape — holds step/active state here, gates step
 * advancement on a surface-reported action, and finishes on skip/close/last step.
 */
export function DemoLesson({ content, onComplete }: Props) {
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

  if (!active) return null;

  const tour = (
    <DemoTour
      steps={content.steps}
      stepIndex={stepIndex}
      onStepIndexChange={setStepIndex}
      isActionSatisfied={isActionSatisfied}
      onSkip={finish}
      onFinish={finish}
    />
  );

  switch (content.surface) {
    case 'stock-stats':
      return (
        <StockStatsDemo ticker={content.ticker} onClose={finish}>
          {tour}
        </StockStatsDemo>
      );
    case 'demo-portfolio':
      return (
        <PortfolioDemo fixtureId={content.fixtureId} onClose={finish}>
          {tour}
        </PortfolioDemo>
      );
    case 'dividend-calculator':
      return (
        <DividendDemo
          holdings={content.holdings}
          years={content.years}
          onCalculated={() => markActionSatisfied('run-calculation')}
          onClose={finish}
        >
          {tour}
        </DividendDemo>
      );
    default:
      return null;
  }
}
