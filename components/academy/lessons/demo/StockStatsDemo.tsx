'use client';

import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import { StatisticsGrid } from '@/components/stock/StatisticsGrid';
import { DemoSurfaceShell } from './DemoSurfaceShell';

interface Props {
  ticker: string;
  onClose: () => void;
  /** The DemoTour overlay, rendered above the surface. */
  children: ReactNode;
}

/**
 * Fundamentals demo: shows the REAL statistics grid for an example company,
 * forced to full (all 15 metrics) so beginners see every fundamental regardless
 * of their experience-level setting. The tour spotlights individual `stat-*`
 * cells inside StatisticsGrid.
 */
export function StockStatsDemo({ ticker, onClose, children }: Props) {
  const { t } = useTranslation('academy');
  const upper = ticker.toUpperCase();
  return (
    <DemoSurfaceShell eyebrow={t('stockStatsDemoEyebrow')} title={t('stockStatsDemoTitle', { ticker: upper })} onClose={onClose}>
      <div data-tour="company-header" className="mb-6 flex items-center gap-3">
        <CompanyLogo name={upper} ticker={upper} size={48} />
        <div className="min-w-0">
          <p className="text-lg font-semibold text-foreground">{upper}</p>
          <p className="text-sm text-muted-foreground">
            {t('stockStatsDemoDescription')}
          </p>
        </div>
      </div>

      <StatisticsGrid ticker={upper} forceFull />

      {children}
    </DemoSurfaceShell>
  );
}
