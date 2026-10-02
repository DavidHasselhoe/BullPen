'use client';

import { useTranslation } from 'react-i18next';
import { MIN_PICKS_FOR_HEADLINE } from '@/lib/picks/types';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

/**
 * How the record is measured, and the disclaimer.
 *
 * Written in full sentences rather than legal boilerplate: a track record that
 * hides its own methodology is a marketing asset, not a record. Anyone should
 * be able to read this and reproduce the number from public prices.
 *
 * Collapsed by default behind an accordion — five paragraphs of always-visible
 * methodology text reads as a wall of clutter on a page that's mostly a chart
 * and a list of picks. Closed, this is one line; anyone who wants the detail
 * opens the row that answers their actual question instead of scanning all five.
 */
const ITEMS = [
  ['how-chosen', 'pickMethodChosenTitle', 'pickMethodChosenBody'],
  ['quarters', 'pickMethodQuartersTitle', 'pickMethodQuartersBody'],
  ['entry-price', 'pickMethodEntryTitle', 'pickMethodEntryBody'],
  ['hundred-once', 'pickMethodHundredTitle', 'pickMethodHundredBody'],
  ['benchmark', 'pickMethodBenchmarkTitle', 'pickMethodBenchmarkBody'],
  ['nothing-removed', 'pickMethodRemovedTitle', 'pickMethodRemovedBody'],
  ['disclaimer', 'pickMethodDisclaimerTitle', 'pickMethodDisclaimerBody'],
] as const;

export function PicksMethodology() {
  const { t } = useTranslation('discover');
  return (
    <section aria-labelledby="methodology-heading" className="space-y-3">
      <h2 id="methodology-heading" className="text-base font-semibold text-foreground">
        {t('pickMethodHeading')}
      </h2>
      <Accordion type="single" collapsible className="rounded-xl border border-border/50 bg-card/40 px-4">
        {ITEMS.map(([value, title, body]) => (
          <AccordionItem key={value} value={value} className="last:border-b-0">
            <AccordionTrigger className="text-sm font-semibold text-foreground">{t(title)}</AccordionTrigger>
            <AccordionContent className="text-xs leading-relaxed text-muted-foreground">
              {t(body, { min: MIN_PICKS_FOR_HEADLINE })}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}
