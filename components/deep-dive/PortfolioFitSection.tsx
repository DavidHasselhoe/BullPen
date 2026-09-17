'use client';

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Layers } from 'lucide-react';
import { useHoldings } from '@/hooks/use-holdings';
import { cn } from '@/lib/utils';
import type { PortfolioFit } from '@/lib/ai/deep-dive/schema';

/**
 * How this company sits against the book the reader owns.
 *
 * Two kinds of statement, kept visibly apart. The ownership line is computed
 * from the live holdings on every render, so it is true today even when the
 * report below it was written weeks ago. The three descriptions came from the
 * model at generation time against the portfolio as it was then, which is why
 * they sit under a dated heading rather than presented as current fact.
 *
 * Deliberately no verdict and no suggested position size. The report already
 * states a stance on the company; this section says how that stance relates to
 * what they hold, and leaves the decision where it belongs.
 */
export function PortfolioFitSection({
  fit,
  ticker,
  generatedAt,
}: {
  fit: PortfolioFit;
  ticker: string;
  generatedAt: string;
}) {
  const { t } = useTranslation('tools');
  const { data: holdings } = useHoldings();

  const owned = useMemo(() => {
    const rows = (holdings ?? []).filter((h) => (h.quantity ?? 0) > 1e-9 && (h.avg_price ?? 0) > 0);
    const total = rows.reduce((sum, h) => sum + (h.quantity ?? 0) * (h.avg_price ?? 0), 0);
    const match = rows.find((h) => h.symbol.toUpperCase() === ticker.toUpperCase());
    if (!match || total <= 0) return null;
    return {
      weightPct: (((match.quantity ?? 0) * (match.avg_price ?? 0)) / total) * 100,
    };
  }, [holdings, ticker]);

  const when = new Date(generatedAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const rows: Array<{ label: string; body: string }> = [
    { label: t('deepDiveFitOverlap'), body: fit.overlap },
    { label: t('deepDiveFitAdds'), body: fit.adds },
    { label: t('deepDiveFitSizing'), body: fit.sizing },
  ];

  return (
    <section className="rounded-xl border border-border/50 bg-card/40 p-5">
      <div className="mb-1 flex items-center gap-2">
        <Layers className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <h3 className="text-sm font-semibold text-foreground">{t('deepDiveFitHeading')}</h3>
      </div>

      <p className="mb-4 text-xs text-muted-foreground">
        {owned
          ? t('deepDiveFitOwnedLine', { pct: owned.weightPct.toFixed(1) })
          : t('deepDiveFitNotOwnedLine')}
        {' · '}
        {t('deepDiveFitAsOf', { date: when })}
      </p>

      <dl className="space-y-3.5">
        {rows.map((row) => (
          <div key={row.label}>
            <dt className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">
              {row.label}
            </dt>
            <dd className={cn('text-[13px] leading-relaxed text-muted-foreground')}>{row.body}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
