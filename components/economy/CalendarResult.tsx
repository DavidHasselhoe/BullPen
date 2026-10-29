'use client';

import { useTranslation } from 'react-i18next';
import { useIntlLocale } from '@/hooks/use-intl-locale';
import type { EconomicEvent } from '@/lib/market-data/economic-kinds';
import type { Metric } from '@/lib/market-data/economic-results';
import { Change } from './Change';
import { fmtMetric, fmtPeriod, fmtRange } from './format';

/** A past release's headline result, as printed that day, for the calendar's day panel. */
export function CalendarResult({ event }: { event: EconomicEvent }) {
  const { t } = useTranslation('economy');
  const locale = useIntlLocale();
  const headline = event.results?.[0] as Metric | undefined;
  if (!headline) return null;

  if (event.kind === 'fomc') {
    const lower = event.results?.find((m) => m.key === 'rate_lower');
    return (
      <p className="text-xs text-foreground">
        <span className="font-medium">{t('calendarResult')}:</span>{' '}
        {event.verdict && <>{t(`verdict_${event.verdict}`)}, </>}
        {lower && <span className="font-mono tabular-nums">{fmtRange(lower.actual, headline.actual, locale, t('rangeTo'))}</span>}
      </p>
    );
  }

  return (
    <p className="flex flex-wrap items-baseline gap-x-2 text-xs text-foreground">
      <span>
        <span className="font-medium">{t('calendarResult')}:</span>{' '}
        {t(`metric_${headline.key}`)}{' '}
        <span className="font-mono tabular-nums">{fmtMetric(headline.key, headline.actual, locale)}</span>
        {event.period_label && <span className="text-muted-foreground"> ({fmtPeriod(event.kind, event.period_label, locale)})</span>}
      </span>
      <Change metric={headline} />
    </p>
  );
}
