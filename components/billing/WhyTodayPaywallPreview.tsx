'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { PreviewLines } from './PreviewShapes';

interface Props {
  /** Real ticker the user was actually looking at when the paywall fired. */
  ticker?: string;
  /** Real day change %, same value StockPricePanel/WhyTodayWidget already have on screen. */
  changePercent?: number;
}

interface PreviewPoint {
  point: string | null;
  more: number;
}

/**
 * "Why Today?" paywall teaser. With the real ticker and day change (every
 * current trigger site has them), it leads with a true hook, "$NVDA rose
 * 2.1% today because…". When today's answer is already cached for that move
 * (/api/ai/why-today/preview, a free Redis read), the hook is followed by its
 * real first sentence and the rest stays locked. Otherwise, the outline only:
 * made-up reasons (analyst upgrades, institutional buying) used to follow the
 * hook, written for a rally and shown under stocks that fell.
 */
export function WhyTodayPaywallPreview({ ticker, changePercent }: Props) {
  const { t, i18n } = useTranslation('billing');
  const isDynamic = ticker != null && changePercent != null;
  const isUp = (changePercent ?? 0) >= 0;
  const pct = Math.abs(changePercent ?? 0).toFixed(1);

  const { data } = useQuery({
    queryKey: ['why-today-preview', ticker, changePercent?.toFixed(1), i18n.language],
    queryFn: async (): Promise<PreviewPoint> => {
      const qs = new URLSearchParams({ ticker: ticker!, pct: String(changePercent), lang: i18n.language });
      const res = await fetch(`/api/ai/why-today/preview?${qs}`);
      if (!res.ok) return { point: null, more: 0 };
      return res.json();
    },
    enabled: isDynamic,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const point = isDynamic ? data?.point : null;

  return (
    <div className="relative bg-card px-6 pb-8 pt-7">
      {isDynamic && (
        <p className="text-left text-sm font-medium leading-relaxed">
          <span className="font-semibold text-foreground">${ticker}</span>{' '}
          <span className={cn('tabular-nums', isUp ? 'text-emerald-400' : 'text-red-400')}>
            {t(isUp ? 'whyTodayPreviewTeaserUp' : 'whyTodayPreviewTeaserDown', { pct })}
          </span>
          {/* With a real sentence below, the hook is its heading; "because—" is only a cliffhanger. */}
          {!point && <> <span className="text-foreground">{t('whyTodayPreviewBecause')}</span></>}
        </p>
      )}
      {point && <p className="mt-1 text-left text-sm leading-relaxed text-foreground">{point}</p>}

      <div className="relative select-none" aria-hidden="true">
        <PreviewLines
          widths={point ? [1, 0.7] : isDynamic ? [1, 0.92, 0.97, 0.6] : [0.35, 1, 0.92, 0.97, 0.6]}
          className={cn('pointer-events-none opacity-80 blur-[1px]', isDynamic && 'mt-3')}
        />
        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full border border-border/70 bg-background/90 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground shadow-sm">
          {point ? t('whyTodayPreviewRestPro') : t('previewBadge')}
        </span>
      </div>

      {/* Top fade keeps the dialog's close button legible over the preview. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-card to-transparent" aria-hidden="true" />
      {/* Bottom fade blends the preview into the content below it. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-card to-transparent" aria-hidden="true" />
    </div>
  );
}
