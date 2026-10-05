'use client';

import { useTranslation } from 'react-i18next';

/** Row widths of the outline, largest position first. Shapes, not weights. */
const ROW_WIDTHS = [0.8, 0.55, 0.4];

/**
 * AI Portfolio Builder paywall teaser: the outline of a suggested allocation.
 * It used to name real tickers at made-up weights (VOO 40%, MSFT 18%, AVGO
 * 12%), which is a stock recommendation nobody made.
 */
export function PortfolioBuilderPaywallPreview() {
  const { t } = useTranslation('billing');
  return (
    <div className="relative select-none bg-card px-6 pb-8 pt-7" aria-hidden="true">
      <p className="text-left text-xs font-medium text-muted-foreground">{t('portfolioBuilderPreviewHeading')}</p>
      <div className="pointer-events-none mt-3 space-y-2.5 opacity-80 blur-[1px]">
        {ROW_WIDTHS.map((w) => (
          <div key={w} className="text-left">
            <div className="flex items-center justify-between gap-2">
              <span className="h-2.5 w-12 rounded-full bg-muted-foreground/25" />
              <span className="h-2.5 w-8 rounded-full bg-muted-foreground/20" />
            </div>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary/40" style={{ width: `${w * 100}%` }} />
            </div>
          </div>
        ))}
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
