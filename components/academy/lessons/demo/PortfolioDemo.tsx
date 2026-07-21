'use client';

import { type ReactNode, useMemo } from 'react';
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
  const holdings = useMemo(() => getDemoPortfolio(fixtureId), [fixtureId]);
  const largest = useMemo(
    () => holdings.reduce((a, b) => ((a.marketValue ?? 0) >= (b.marketValue ?? 0) ? a : b)),
    [holdings],
  );

  return (
    <DemoSurfaceShell eyebrow="Demo · Building a portfolio" title="An example portfolio" onClose={onClose}>
      <p className="mb-6 text-sm text-muted-foreground">
        This is a sample portfolio — not your holdings. Watch how BullPen breaks down where the
        money actually sits, across individual holdings and sectors.
      </p>

      <div data-tour="portfolio-overview" className="mb-6">
        <PortfolioDashboard holdings={holdings} />
      </div>

      <div data-tour="allocation-chart" className="mb-6">
        <HoldingsPieChart holdings={holdings} />
      </div>

      <div data-tour="largest-position" className="rounded-xl border border-border/50 bg-card p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Biggest position</p>
        <p className="mt-1 text-sm text-foreground">
          <span className="font-semibold">{largest.symbol}</span> is the largest slice of this
          portfolio. Position sizing — how much of your money any single stock represents — is just
          as important as which stocks you pick.
        </p>
      </div>

      {children}
    </DemoSurfaceShell>
  );
}
