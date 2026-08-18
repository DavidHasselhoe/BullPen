// components/holdings/risk-analysis/AIAssessment.tsx
'use client';

import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import type { RiskAnalysis } from './types';

const METRIC_LABELS: Record<string, string> = {
  concentration: 'Concentration',
  sectorDiversification: 'Sector diversification',
  marketCapBias: 'Market-cap bias',
  volatilityExposure: 'Volatility exposure',
  correlationRisk: 'Correlation risk',
  liquidityRisk: 'Liquidity risk',
};

// Real weighting from the system prompt (app/api/holdings/risk-analysis/route.ts:61)
// — documentation of already-shipped logic, not new copy.
const METHODOLOGY_TEXT =
  'The overall score is a weighted average across six dimensions: concentration (25%), ' +
  'sector diversification (20%), volatility exposure (20%), market-cap bias (15%), ' +
  'correlation risk (10%), and liquidity risk (10%). Each dimension is scored 0-100 ' +
  'from the portfolio\'s actual holdings, allocations, and sector membership.';

interface Props {
  metrics: RiskAnalysis['metrics'];
}

export function AIAssessment({ metrics }: Props) {
  const entries = Object.entries(metrics) as [string, RiskAnalysis['metrics'][keyof RiskAnalysis['metrics']]][];

  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-foreground">AI assessment</h3>
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
            <span className="text-sm text-foreground">Methodology</span>
          </AccordionTrigger>
          <AccordionContent>
            <p className="text-[13px] leading-relaxed text-muted-foreground">{METHODOLOGY_TEXT}</p>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
