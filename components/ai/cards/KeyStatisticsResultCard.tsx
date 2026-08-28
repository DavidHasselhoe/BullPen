'use client';

import { useTranslation } from 'react-i18next';
import { RangeBar } from '@/components/viz/RangeBar';
import { CardShell, StatCell } from './CardPrimitives';

export interface KeyStatisticsOutput {
  ticker: string;
  marketCap: string;
  peRatioTTM: string;
  pbRatio: string;
  evToEbitda: string;
  beta: string;
  dividendYield: string;
  profitMargin: string;
  week52HighRaw?: number | null;
  week52LowRaw?: number | null;
}

export function KeyStatisticsResultCard({
  output,
  livePrice,
}: {
  output: KeyStatisticsOutput;
  /** Current price from a sibling getLiveQuote call in the same message, if any — powers the RangeBar marker. */
  livePrice?: number | null;
}) {
  const { t } = useTranslation('ai');
  const hasRange =
    output.week52HighRaw != null && output.week52LowRaw != null && output.week52HighRaw > output.week52LowRaw;

  return (
    <CardShell>
      <div className="mb-2 font-semibold text-foreground">{t('statisticsValuationTitle', { ticker: output.ticker })}</div>
      {hasRange && (
        <div className="mb-2.5 border-b border-border/40 pb-2.5">
          <RangeBar
            low={output.week52LowRaw!}
            high={output.week52HighRaw!}
            current={livePrice ?? null}
            srLabel={
              livePrice != null
                ? t('statisticsRangeSrLabelWithCurrent', { low: output.week52LowRaw!.toFixed(2), high: output.week52HighRaw!.toFixed(2), current: livePrice.toFixed(2) })
                : t('statisticsRangeSrLabel', { low: output.week52LowRaw!.toFixed(2), high: output.week52HighRaw!.toFixed(2) })
            }
          />
        </div>
      )}
      <div className="grid grid-cols-3 gap-x-3 gap-y-2.5">
        <StatCell label={t('statisticsMarketCap')} value={output.marketCap} />
        <StatCell label={t('statisticsPeTtm')} value={output.peRatioTTM} />
        <StatCell label={t('statisticsPb')} value={output.pbRatio} />
        <StatCell label={t('statisticsEvEbitda')} value={output.evToEbitda} />
        <StatCell label={t('statisticsBeta')} value={output.beta} />
        <StatCell label={t('statisticsDivYield')} value={output.dividendYield} />
      </div>
    </CardShell>
  );
}
