'use client';

import { useTranslation } from 'react-i18next';

/**
 * Static, fabricated "Why Today?" answer used purely as a paywall teaser.
 * Never real user/market data — mirrors WhyTodayView's actual layout (ticker
 * + change header, then streamed bullet lines) so the preview reads as a
 * believable example of what unlocking the feature would show.
 */
export function WhyTodayPaywallPreview() {
  const { t } = useTranslation('billing');
  const mockLines = [
    t('whyTodayPreviewLine1'),
    t('whyTodayPreviewLine2'),
    t('whyTodayPreviewLine3'),
  ];
  return (
    <div className="relative select-none bg-card px-6 pb-8 pt-7" aria-hidden="true">
      <div className="pointer-events-none opacity-70 blur-[3px]">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">{t('whyTodayPreviewTicker')}</span>
          <span className="text-sm font-medium tabular-nums text-emerald-400">
            {t('whyTodayPreviewChange')}
          </span>
        </div>

        <div className="mt-4 space-y-2 text-left text-xs text-muted-foreground">
          {mockLines.map((line) => (
            <p key={line} className="leading-relaxed">{line}</p>
          ))}
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
