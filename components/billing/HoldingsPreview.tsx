'use client';

import { useTranslation } from 'react-i18next';

/**
 * What My Holdings shows, for a guest: the page's real sections with their
 * values as shapes. No sample portfolio: hand-set prices for real tickers
 * would read as BullPen's numbers (see components/billing/PreviewShapes.tsx).
 */
export function HoldingsPreview() {
  const { t } = useTranslation('holdings');
  const { t: tb } = useTranslation('billing');
  const bar = 'rounded-full bg-muted-foreground/20';

  return (
    <div className="relative select-none overflow-hidden rounded-2xl border border-border bg-card p-5 text-left" aria-hidden="true">
      <div className="pointer-events-none opacity-80">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs text-muted-foreground">{t('holdingsPreviewValue')}</p>
            <div className={`mt-1.5 h-6 w-32 ${bar}`} />
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">{t('perfCalToday')}</p>
            <div className={`mt-1.5 ml-auto h-3 w-16 ${bar}`} />
          </div>
        </div>

        <div className="mt-5 flex items-center gap-5">
          {/* The allocation ring, unlabelled: which slice is which is the user's. */}
          <div
            className="h-20 w-20 shrink-0 rounded-full"
            style={{
              background: 'conic-gradient(var(--muted-foreground) 0 38%, color-mix(in oklch, var(--muted-foreground) 55%, transparent) 0 64%, color-mix(in oklch, var(--muted-foreground) 30%, transparent) 0 84%, var(--muted) 0)',
              mask: 'radial-gradient(circle, transparent 54%, var(--foreground) 55%)',
              WebkitMask: 'radial-gradient(circle, transparent 54%, var(--foreground) 55%)',
              opacity: 0.45,
            }}
          />
          <div className="flex-1">
            <p className="text-xs text-muted-foreground">{t('holdingsPieChartTitle')}</p>
            <div className="mt-2 space-y-2">
              {[0.8, 0.6, 0.45].map((w) => (
                <div key={w} className={`h-2.5 ${bar}`} style={{ width: `${w * 100}%` }} />
              ))}
            </div>
          </div>
        </div>

        <p className="mt-5 text-xs text-muted-foreground">{t('holdingsTablePositionsTitle')}</p>
        <div className="mt-2 space-y-2.5">
          {[0.5, 0.4, 0.55].map((w, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="h-6 w-6 shrink-0 rounded-md bg-muted-foreground/20" />
              <div className={`h-2.5 ${bar}`} style={{ width: `${w * 60}%` }} />
              <div className={`ml-auto h-2.5 w-14 ${bar}`} />
            </div>
          ))}
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-card to-transparent" />
      <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-border/70 bg-background/90 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground shadow-sm">
        {tb('previewBadge')}
      </span>
    </div>
  );
}
