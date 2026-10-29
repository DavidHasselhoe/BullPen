'use client';

import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowUp, Equal } from 'lucide-react';
import { useIntlLocale } from '@/hooks/use-intl-locale';
import type { Metric } from '@/lib/market-data/economic-results';
import { fmtMetric } from './format';

/** Up, down or unchanged against the previous value. Neutral colour: direction is not good or bad here. */
export function Change({ metric }: { metric: Metric }) {
  const { t } = useTranslation('economy');
  const locale = useIntlLocale();
  if (metric.previous == null) return null;
  const prev = fmtMetric(metric.key, metric.previous, locale);
  const diff = metric.actual - metric.previous;
  const [Icon, text] = Math.abs(diff) < 1e-9
    ? [Equal, t('sameAs', { value: prev })]
    : diff > 0 ? [ArrowUp, t('upFrom', { value: prev })] : [ArrowDown, t('downFrom', { value: prev })];
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <Icon className="h-3 w-3" aria-hidden />
      <span className="tabular-nums">{text}</span>
    </span>
  );
}
