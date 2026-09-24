'use client';

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useHoldings } from '@/hooks/use-holdings';
import type { DeepDiveReport as Report } from '@/lib/ai/deep-dive/schema';

/**
 * The report's conclusion, addressed to the reader who is actually reading it.
 *
 * Every report has carried verdict.bottomLine since the field was added: the
 * prompt requires it, the schema stores it, and until now nothing rendered it,
 * so the model was writing two careful sentences per report that no one ever
 * saw. Both are produced deliberately (see BottomLineSchema) so that a report
 * saved while someone owned the stock still reads correctly after they sell,
 * which is why the choice of line happens here, from live holdings, rather
 * than being baked in at generation time.
 *
 * The other line stays on screen underneath, quieter. A reader considering a
 * position often wants to know what a holder is being told, and vice versa.
 */
export function BottomLine({ report }: { report: Report }) {
  const { t } = useTranslation('tools');
  const { data: holdings } = useHoldings();
  const bottomLine = report.verdict.bottomLine;

  const holds = useMemo(
    () =>
      (holdings ?? []).some(
        (h) => h.symbol.toUpperCase() === report.ticker.toUpperCase() && (h.quantity ?? 0) > 1e-9,
      ),
    [holdings, report.ticker],
  );

  if (!bottomLine) return null;

  const primary = holds
    ? { label: t('deepDiveBottomLineHolding'), text: bottomLine.holding }
    : { label: t('deepDiveBottomLineConsidering'), text: bottomLine.considering };
  const secondary = holds
    ? { label: t('deepDiveBottomLineConsidering'), text: bottomLine.considering }
    : { label: t('deepDiveBottomLineHolding'), text: bottomLine.holding };

  return (
    <section className="rounded-xl border border-border/50 bg-card/40 p-5">
      <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
        {t('deepDiveBottomLineHeading')}
      </h3>

      <p className="text-sm leading-relaxed text-foreground">
        <span className="font-semibold">{primary.label}: </span>
        {primary.text}
      </p>

      {secondary.text && (
        <p className="mt-2.5 text-[13px] leading-relaxed text-muted-foreground">
          <span className="font-medium">{secondary.label}: </span>
          {secondary.text}
        </p>
      )}
    </section>
  );
}
