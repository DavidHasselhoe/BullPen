'use client';

import { useTranslation } from 'react-i18next';
import { PreviewMetricRow } from './PreviewShapes';

interface Props {
  /** Real symbols in the portfolio about to be analyzed, if known at the
   *  trigger site (PortfolioRiskAnalysis always has this — see holdings). */
  tickers?: string[];
}

/**
 * Risk Analysis paywall teaser. "Analyzing AAPL, MSFT…" is the reader's own
 * portfolio and stays sharp. Below it, the outline of the analysis with no
 * score, level or percentages: a made-up "72/100, High Risk" used to sit
 * under the reader's real holdings, which is a verdict on their money.
 */
export function RiskAnalysisPaywallPreview({ tickers }: Props) {
  const { t } = useTranslation('billing');
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
      <div className="pointer-events-none opacity-80 blur-[1px]">
        <div className="h-7 w-24 rounded-md bg-muted-foreground/20" />
        {/* The low-to-high scale, without a marker on it. */}
        <div className="mt-3 h-2 w-full rounded-full bg-gradient-to-r from-emerald-500/40 via-amber-400/40 to-red-500/40" />
        <div className="mt-5 space-y-2.5">
          <PreviewMetricRow label={t('riskAnalysisPreviewTechConcentration')} />
          <PreviewMetricRow label={t('riskAnalysisPreviewSectorDiversification')} />
          <PreviewMetricRow label={t('riskAnalysisPreviewLiquidity')} />
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
