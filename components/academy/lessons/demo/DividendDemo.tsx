'use client';

import type { ReactNode } from 'react';
import DividendClientPage, { type DividendSeedHolding } from '@/app/tools/dividend/DividendClientPage';
import { DemoSurfaceShell } from './DemoSurfaceShell';

interface Props {
  holdings: DividendSeedHolding[];
  years: number;
  onCalculated: () => void;
  onClose: () => void;
  children: ReactNode;
}

/**
 * Dividends demo: mounts the REAL dividend calculator preloaded with example
 * dividend stocks, in embedded mode (no page chrome, no localStorage writes).
 * The tour asks the learner to run one calculation; `onCalculated` unlocks it.
 */
export function DividendDemo({ holdings, years, onCalculated, onClose, children }: Props) {
  return (
    <DemoSurfaceShell eyebrow="Demo · Dividends & passive income" title="Dividend calculator" onClose={onClose}>
      <p className="mb-6 text-sm text-muted-foreground">
        This is BullPen&apos;s real dividend calculator, preloaded with a few example
        dividend-paying stocks. Hit calculate to project the passive income they&apos;d generate.
      </p>

      <DividendClientPage
        embedded
        initialHoldings={holdings}
        initialYears={years}
        onCalculated={onCalculated}
      />

      {children}
    </DemoSurfaceShell>
  );
}
