'use client';

import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { PreviewLines } from './PreviewShapes';

interface Props {
  /** Real ticker the user was actually looking at when the paywall fired. */
  ticker?: string;
  /** Real day change %, same value StockPricePanel/WhyTodayWidget already have on screen. */
  changePercent?: number;
}

/**
 * "Why Today?" paywall teaser. With the real ticker and day change (every
 * current trigger site has them), it leads with a true hook, "$NVDA rose
 * 2.1% today because…", then the outline of the explanation. The reasons are
 * the paid answer. Made-up ones (analyst upgrades, institutional buying) used
 * to follow the hook, written for a rally and shown under stocks that fell.
 */
export function WhyTodayPaywallPreview({ ticker, changePercent }: Props) {
  const { t } = useTranslation('billing');
  const isDynamic = ticker != null && changePercent != null;
  const isUp = (changePercent ?? 0) >= 0;
  const pct = Math.abs(changePercent ?? 0).toFixed(1);

  return (
    <div className="relative select-none bg-card px-6 pb-8 pt-7" aria-hidden="true">
      {isDynamic && (
        <p className="text-left text-sm font-medium leading-relaxed">
          <span className="font-semibold text-foreground">${ticker}</span>{' '}
          <span className={cn('tabular-nums', isUp ? 'text-emerald-400' : 'text-red-400')}>
            {t(isUp ? 'whyTodayPreviewTeaserUp' : 'whyTodayPreviewTeaserDown', { pct })}
          </span>{' '}
          <span className="text-foreground">{t('whyTodayPreviewBecause')}</span>
        </p>
      )}

      <PreviewLines
        widths={isDynamic ? [1, 0.92, 0.97, 0.6] : [0.35, 1, 0.92, 0.97, 0.6]}
        className={cn('pointer-events-none opacity-80 blur-[1px]', isDynamic && 'mt-3')}
      />

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
