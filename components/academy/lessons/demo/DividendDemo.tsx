'use client';

import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation('academy');
  return (
    <DemoSurfaceShell eyebrow={t('dividendDemoEyebrow')} title={t('dividendDemoTitle')} onClose={onClose}>
      <p className="mb-6 text-sm text-muted-foreground">
        {t('dividendDemoDescription')}
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
