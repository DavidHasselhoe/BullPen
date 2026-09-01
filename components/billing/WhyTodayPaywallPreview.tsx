'use client';

import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

interface Props {
  /** Real ticker the user was actually looking at when the paywall fired. */
  ticker?: string;
  /** Real day change %, same value StockPricePanel/WhyTodayWidget already have on screen. */
  changePercent?: number;
}

/**
 * "Why Today?" paywall teaser. When the caller has the real ticker + day
 * change on hand (every current trigger site does — see StockPricePanel,
 * WhyTodayWidget), it leads with a real, unblurred hook built from that
 * live data: "$NVDA rose 2.1% today" — then cuts off at "because—" into a
 * blurred, still-fabricated continuation, since the actual reasoning is
 * exactly the paid answer being withheld. Falls back to the fully static,
 * fabricated example when no real data is passed.
 */
export function WhyTodayPaywallPreview({ ticker, changePercent }: Props) {
  const { t } = useTranslation('billing');
  const isDynamic = ticker != null && changePercent != null;
  const isUp = (changePercent ?? 0) >= 0;
  const pct = Math.abs(changePercent ?? 0).toFixed(1);

  const mockLines = [t('whyTodayPreviewLine2'), t('whyTodayPreviewLine3')];

  return (
    <div className="relative select-none bg-card px-6 pb-8 pt-7" aria-hidden="true">
      {isDynamic ? (
        <p className="text-left text-sm font-medium leading-relaxed">
          <span className="font-semibold text-foreground">${ticker}</span>{' '}
          <span className={cn('tabular-nums', isUp ? 'text-emerald-400' : 'text-red-400')}>
            {t(isUp ? 'whyTodayPreviewTeaserUp' : 'whyTodayPreviewTeaserDown', { pct })}
          </span>{' '}
          <span className="text-foreground">{t('whyTodayPreviewBecause')}</span>
        </p>
      ) : (
        <div className="pointer-events-none opacity-70 blur-[3px]">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">{t('whyTodayPreviewTicker')}</span>
            <span className="text-sm font-medium tabular-nums text-emerald-400">
              {t('whyTodayPreviewChange')}
            </span>
          </div>
          <p className="mt-2 text-left text-xs leading-relaxed text-muted-foreground">
            {t('whyTodayPreviewLine1')}
          </p>
        </div>
      )}

      <div className={cn('pointer-events-none opacity-70 blur-[3px]', isDynamic && 'mt-3')}>
        <div className="space-y-2 text-left text-xs text-muted-foreground">
          {mockLines.map((line) => (
            <p key={line} className="leading-relaxed">{line}</p>
          ))}
        </div>
      </div>

      {/* Top fade keeps the dialog's close button legible over the preview. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-card to-transparent" />
      {/* Bottom fade blends the preview into the content below it. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-card to-transparent" />

      <span className="absolute left-1/2 top-[calc(50%+10px)] -translate-x-1/2 -translate-y-1/2 rounded-full border border-border/70 bg-background/90 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground shadow-sm">
        {t('previewBadge')}
      </span>
    </div>
  );
}
