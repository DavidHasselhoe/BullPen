'use client';

import { useTranslation } from 'react-i18next';
import { PreviewLines } from './PreviewShapes';

interface Props {
  /** Real ticker the chart/page was showing when the gate fired, if known
   *  — the in-chart assistant (ChartAIPanel) always has this. */
  ticker?: string;
}

/**
 * Ask Bull paywall teaser (the main chat and the in-chart assistant share it).
 * The question is an invitation, so it names the reader's ticker. The reply
 * is the outline of an answer: a written one was about NVDA's data-center
 * demand and showed up under Coca-Cola as Bull's view of it.
 */
export function AskBullPaywallPreview({ ticker }: Props) {
  const { t } = useTranslation('billing');
  return (
    <div className="relative select-none bg-card px-6 pb-8 pt-7" aria-hidden="true">
      <div className="pointer-events-none space-y-2.5">
        <div className="flex justify-end">
          <div className="max-w-[75%] rounded-2xl rounded-br-sm bg-primary/10 px-3 py-2 text-left text-xs text-foreground">
            {ticker ? t('askBullPreviewUserMessageTicker', { ticker: `$${ticker}` }) : t('askBullPreviewUserMessage')}
          </div>
        </div>
        <div className="flex justify-start">
          <div className="w-[85%] rounded-2xl rounded-bl-sm bg-muted px-3 py-2.5 opacity-80 blur-[1px]">
            <PreviewLines widths={[1, 0.94, 0.7]} />
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
