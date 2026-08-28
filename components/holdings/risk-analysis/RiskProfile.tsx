// components/holdings/risk-analysis/RiskProfile.tsx
'use client';

import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { cn } from '@/lib/utils';
import type { RiskAnalysis } from './types';
import { scoreTier, tierBarClass, tierTextClass } from './colors';

function getMetricLabels(t: TFunction): Record<string, string> {
  return {
    concentration: t('riskProfileMetricConcentration'),
    sectorDiversification: t('riskProfileMetricSectorDiversification'),
    marketCapBias: t('riskProfileMetricMarketCapBias'),
    volatilityExposure: t('riskProfileMetricVolatilityExposure'),
    correlationRisk: t('riskProfileMetricCorrelationRisk'),
    liquidityRisk: t('riskProfileMetricLiquidityRisk'),
  };
}

interface Props {
  metrics: RiskAnalysis['metrics'];
}

export function RiskProfile({ metrics }: Props) {
  const { t } = useTranslation('holdings');
  const METRIC_LABELS = getMetricLabels(t);
  const rows = Object.entries(metrics) as [string, RiskAnalysis['metrics'][keyof RiskAnalysis['metrics']]][];

  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold text-foreground">{t('riskProfileTitle')}</h3>
      <div className="space-y-2.5">
        {rows.map(([key, metric]) => {
          const tier = scoreTier(metric.score);
          return (
            <div key={key} className="flex items-center gap-3">
              <span className="w-32 shrink-0 text-[13px] text-muted-foreground">{METRIC_LABELS[key] ?? key}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted/40">
                <div
                  className={cn('h-full rounded-full transition-all duration-500', tierBarClass(tier))}
                  style={{ width: `${Math.max(0, Math.min(100, metric.score))}%` }}
                />
              </div>
              <span className={cn('w-7 shrink-0 text-right font-mono text-[13px] font-semibold tabular-nums', tier === 'neutral' ? 'text-muted-foreground' : tierTextClass(tier))}>
                {metric.score}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
