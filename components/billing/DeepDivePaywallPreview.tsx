'use client';

import { useTranslation } from 'react-i18next';
import { PreviewMetricRow } from './PreviewShapes';

interface Props {
  /** Real ticker (and optionally company name) being deep-dived, if known
   *  at the trigger site — the deep-dive page always has the ticker. */
  ticker?: string;
  companyName?: string;
}

/**
 * Deep Dive paywall teaser. The "Deep Dive: $AAPL" line is true, so it stays
 * sharp. Below it, the outline of a report with no score or verdict: the
 * report is the paid result, and this dialog can't know it. A made-up
 * "84/100, Strong fundamentals" used to sit under the real company's name.
 */
export function DeepDivePaywallPreview({ ticker, companyName }: Props) {
  const { t } = useTranslation('billing');
  return (
    <div className="relative select-none bg-card px-6 pb-8 pt-7" aria-hidden="true">
      {ticker && (
        <p className="mb-3 text-left text-xs font-medium text-foreground">
          {t('deepDivePreviewFor', { ticker: companyName ? `${ticker} · ${companyName}` : ticker })}
        </p>
      )}
      <div className="pointer-events-none opacity-80 blur-[1px]">
        <div className="h-7 w-24 rounded-md bg-muted-foreground/20" />
        <div className="mt-5 space-y-2.5">
          <PreviewMetricRow label={t('deepDivePreviewGrowth')} />
          <PreviewMetricRow label={t('deepDivePreviewValuation')} />
          <PreviewMetricRow label={t('deepDivePreviewFinancialHealth')} />
        </div>
      </div>

      {/* Top fade keeps the dialog's close button legible over the preview. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-card to-transparent" />
      {/* Bottom fade blends the preview into the content below it. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-card to-transparent" />

      <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-border/70 bg-background/90 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground shadow-sm">
        {t('previewBadge')}
      </span>
    </div>
  );
}
