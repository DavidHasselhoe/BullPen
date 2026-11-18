'use client';

import { useTranslation } from 'react-i18next';
import { Lock } from 'lucide-react';
import { ThreeThings } from '@/components/deep-dive/ThreeThings';
import { SectionHeading, sectionOutline } from '@/components/deep-dive/DeepDiveSections';
import { fmtClockDate } from '@/lib/dates/clock';
import { DEEP_DIVE_SAMPLE as sample } from '@/lib/billing/deep-dive-sample';

interface Props {
  /** The ticker the reader wanted a deep dive on, if known at the trigger site. */
  ticker?: string;
  /** The signed-out page has room for the three-things cards; the 384px paywall dialog doesn't. */
  full?: boolean;
}

/**
 * Deep Dive paywall teaser: the top of one real report, named as a sample.
 *
 * A preview of the reader's own report can't exist (the report is the paid
 * result), and a made-up one under their company's name read as BullPen's
 * verdict on it. So this shows a real, frozen report on Alphabet, labelled
 * with its company and date, and only whole pieces of it: the headline, the
 * one-liner, and (on the page) the three things. The rest is listed by
 * section, never cut mid-sentence. See lib/billing/deep-dive-sample.ts for
 * why it is a fixed file and not someone's stored report.
 */
export function DeepDivePaywallPreview({ ticker, full = false }: Props) {
  const { t } = useTranslation('billing');
  const { t: tTools } = useTranslation('tools');
  const date = fmtClockDate(new Date(sample.generatedAt), { month: 'short', day: 'numeric', year: 'numeric' });
  const sections = sectionOutline(sample, tTools);
  const other = ticker && ticker.toUpperCase() !== sample.ticker;

  return (
    <div className="bg-card px-6 pb-6 pt-7 text-left">
      <p className="text-xs font-medium text-muted-foreground">
        {t('deepDiveSampleLabel', { company: sample.companyName, date })}
      </p>
      <p className="mt-2 text-base font-semibold leading-snug text-foreground">{sample.headline}</p>
      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{sample.verdict.oneLiner}</p>

      {/* Stacked on a phone, the three cards push the sign-up button a screen down. */}
      {full && (
        <div className="mt-4 hidden sm:block">
          <ThreeThings report={sample} />
        </div>
      )}

      <p className="mt-5 text-xs font-medium text-muted-foreground">{t('deepDiveSampleInside')}</p>
      <ul className="mt-2 space-y-1.5">
        {sections.map(({ key, hint }) => (
          <li key={key} className="flex items-center justify-between gap-3 rounded-xl border border-border/50 px-3 py-2">
            <SectionHeading sectionKey={key} hint={hint} />
            <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
          </li>
        ))}
      </ul>

      {other && (
        <p className="mt-4 text-xs text-muted-foreground">{t('deepDiveSampleYours', { ticker: ticker.toUpperCase() })}</p>
      )}
    </div>
  );
}
