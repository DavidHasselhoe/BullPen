// components/holdings/risk-analysis/AIAssessment.tsx
'use client';

import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import type { RiskAnalysis } from './types';

function getMetricLabels(t: TFunction): Record<string, string> {
  return {
    concentration: t('aiAssessmentMetricConcentration'),
    sectorDiversification: t('aiAssessmentMetricSectorDiversification'),
    marketCapBias: t('aiAssessmentMetricMarketCapBias'),
    volatilityExposure: t('aiAssessmentMetricVolatilityExposure'),
    correlationRisk: t('aiAssessmentMetricCorrelationRisk'),
    liquidityRisk: t('aiAssessmentMetricLiquidityRisk'),
  };
}

interface Props {
  metrics: RiskAnalysis['metrics'];
}

export function AIAssessment({ metrics }: Props) {
  const { t } = useTranslation('holdings');
  const METRIC_LABELS = getMetricLabels(t);
  const entries = Object.entries(metrics) as [string, RiskAnalysis['metrics'][keyof RiskAnalysis['metrics']]][];

  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-foreground">{t('aiAssessmentTitle')}</h3>
      <Accordion type="single" collapsible className="border-t border-border/20">
        {entries.map(([key, metric]) => (
          <AccordionItem key={key} value={key} className="border-border/20">
            <AccordionTrigger className="py-3 hover:no-underline">
              <span className="text-sm text-foreground">{METRIC_LABELS[key] ?? key}</span>
            </AccordionTrigger>
            <AccordionContent>
              <p className="text-[13px] leading-relaxed text-muted-foreground">{metric.detail}</p>
            </AccordionContent>
          </AccordionItem>
        ))}
        <AccordionItem value="methodology" className="border-border/20">
          <AccordionTrigger className="py-3 hover:no-underline">
            <span className="text-sm text-foreground">{t('aiAssessmentMethodologyTitle')}</span>
          </AccordionTrigger>
          <AccordionContent>
            <p className="text-[13px] leading-relaxed text-muted-foreground">{t('aiAssessmentMethodologyText')}</p>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
