'use client';

import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

const TIER_FILL: Record<'risk' | 'caution' | 'neutral', string> = {
  risk: 'bg-red-500',
  caution: 'bg-amber-500',
  neutral: 'bg-emerald-500',
};

interface Props {
  /** Real symbols in the portfolio about to be analyzed, if known at the
   *  trigger site (PortfolioRiskAnalysis always has this — see holdings). */
  tickers?: string[];
}

/**
 * Fabricated mini risk-analysis visual used purely as a paywall teaser. The
 * score/bars stay fabricated and blurred on purpose — this dialog has no
 * access to a real result, and showing real-looking numbers here would be
 * misleading the moment they're wrong. When the caller has the real
 * portfolio's symbols, though, an unblurred "Analyzing AAPL, MSFT…" line
 * leads the preview — that part IS true, it's just what's in the user's
 * own portfolio, not a fabricated result.
 */
export function RiskAnalysisPaywallPreview({ tickers }: Props) {
  const { t } = useTranslation('billing');
  const mockBars: { label: string; pct: number; tier: 'risk' | 'caution' | 'neutral' }[] = [
    { label: t('riskAnalysisPreviewTechConcentration'), pct: 74, tier: 'risk' },
    { label: t('riskAnalysisPreviewSectorDiversification'), pct: 46, tier: 'caution' },
    { label: t('riskAnalysisPreviewLiquidity'), pct: 22, tier: 'neutral' },
  ];
  const shown = (tickers ?? []).slice(0, 3);
  const moreCount = (tickers?.length ?? 0) - shown.length;
  const analyzingLine =
    shown.length > 0
      ? moreCount > 0
        ? t('riskAnalysisPreviewAnalyzingMore', { tickers: shown.join(', '), count: moreCount })
        : t('riskAnalysisPreviewAnalyzing', { tickers: shown.join(', ') })
      : null;

  return (
    <div className="relative select-none bg-card px-6 pb-8 pt-7" aria-hidden="true">
      {analyzingLine && (
        <p className="mb-3 text-left text-xs font-medium text-foreground">{analyzingLine}</p>
      )}
      <div className="pointer-events-none opacity-70 blur-[3px]">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-3xl font-bold tabular-nums text-foreground">
            72<span className="text-base text-muted-foreground">/100</span>
          </span>
          <span className="text-sm font-semibold text-red-400">{t('riskAnalysisPreviewLevel')}</span>
        </div>

        <div className="relative mt-3 h-2 w-full rounded-full bg-gradient-to-r from-emerald-500 via-amber-400 to-red-500">
          <div
            className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-foreground"
            style={{ left: '72%' }}
          />
        </div>

        <div className="mt-5 space-y-2.5">
          {mockBars.map((b) => (
            <div key={b.label}>
              <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
                <span>{b.label}</span>
                <span className="font-mono tabular-nums">{b.pct}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div className={cn('h-full rounded-full', TIER_FILL[b.tier])} style={{ width: `${b.pct}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Top fade keeps the dialog's close button legible over the chart. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-card to-transparent" />
      {/* Bottom fade blends the preview into the content below it. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-card to-transparent" />

      <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-border/70 bg-background/90 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground shadow-sm">
        {t('previewBadge')}
      </span>
    </div>
  );
}
