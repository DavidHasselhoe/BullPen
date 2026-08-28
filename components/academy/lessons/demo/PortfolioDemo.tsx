'use client';

import { type ReactNode, useMemo } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { PortfolioDashboard } from '@/components/holdings/PortfolioDashboard';
import { HoldingsPieChart } from '@/components/holdings/HoldingsPieChart';
import { getDemoPortfolio } from '@/lib/academy/demo-portfolio-fixtures';
import { DemoSurfaceShell } from './DemoSurfaceShell';

interface Props {
  fixtureId: string;
  onClose: () => void;
  children: ReactNode;
}

/**
 * Portfolio demo: feeds a static example portfolio (unrelated to the user's real
 * holdings) into the REAL PortfolioDashboard + HoldingsPieChart so beginners can
 * see sector diversification and position sizing. Zero market-data calls — the
 * fixture carries hand-set prices.
 */
export function PortfolioDemo({ fixtureId, onClose, children }: Props) {
  const { t } = useTranslation('academy');
  const holdings = useMemo(() => getDemoPortfolio(fixtureId), [fixtureId]);
  const largest = useMemo(
    () => holdings.reduce((a, b) => ((a.marketValue ?? 0) >= (b.marketValue ?? 0) ? a : b)),
    [holdings],
  );

  return (
    <DemoSurfaceShell eyebrow={t('portfolioDemoEyebrow')} title={t('portfolioDemoTitle')} onClose={onClose}>
      <p className="mb-6 text-sm text-muted-foreground">
        {t('portfolioDemoDescription')}
      </p>

      <div data-tour="portfolio-overview" className="mb-6">
        <PortfolioDashboard holdings={holdings} />
      </div>

      <div data-tour="allocation-chart" className="mb-6">
        <HoldingsPieChart holdings={holdings} />
      </div>

      <div data-tour="largest-position" className="rounded-xl border border-border/50 bg-card p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('portfolioDemoBiggestPosition')}</p>
        <p className="mt-1 text-sm text-foreground">
          <Trans
            i18nKey="portfolioDemoBiggestPositionDescription"
            ns="academy"
            values={{ symbol: largest.symbol }}
            components={{ strong: <span className="font-semibold" /> }}
          />
        </p>
      </div>

      {children}
    </DemoSurfaceShell>
  );
}
