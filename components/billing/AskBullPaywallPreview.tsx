'use client';

import { useTranslation } from 'react-i18next';

interface Props {
  /** Real ticker the chart/page was showing when the gate fired, if known
   *  — the in-chart assistant (ChartAIPanel) always has this. */
  ticker?: string;
}

/**
 * Fabricated chat exchange used purely as a paywall teaser for Ask Bull
 * (both the main chat and the in-chart assistant share this feature name,
 * so they share this preview). Bull's reply stays fabricated on purpose —
 * it's the actual paid answer. The user's question swaps in the real
 * ticker when known, since asking about the stock the reader is actually
 * looking at reads as an invitation, not a fabricated result.
 */
export function AskBullPaywallPreview({ ticker }: Props) {
  const { t } = useTranslation('billing');
  return (
    <div className="relative select-none bg-card px-6 pb-8 pt-7" aria-hidden="true">
      <div className="pointer-events-none space-y-2.5 opacity-70 blur-[3px]">
        <div className="flex justify-end">
          <div className="max-w-[75%] rounded-2xl rounded-br-sm bg-primary/10 px-3 py-2 text-left text-xs text-foreground">
            {ticker ? t('askBullPreviewUserMessageTicker', { ticker: `$${ticker}` }) : t('askBullPreviewUserMessage')}
          </div>
        </div>
        <div className="flex justify-start">
          <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-muted px-3 py-2 text-left text-xs text-foreground">
            {t('askBullPreviewBullReply')}
          </div>
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
