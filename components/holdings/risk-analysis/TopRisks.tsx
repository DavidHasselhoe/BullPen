// components/holdings/risk-analysis/TopRisks.tsx
'use client';

import { cn } from '@/lib/utils';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import type { RiskAnalysis } from './types';
import { topRiskTier, tierBadgeClass } from './colors';

interface Props {
  risks: RiskAnalysis['topRisks'];
}

export function TopRisks({ risks }: Props) {
  if (!risks?.length) return null;

  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-foreground">Top risks</h3>
      <Accordion type="single" collapsible className="border-t border-border/20">
        {risks.map((risk, i) => (
          <AccordionItem key={i} value={String(i)} className="border-border/20">
            <AccordionTrigger className="py-3 hover:no-underline">
              <div className="flex min-w-0 items-baseline gap-3 text-left">
                <span className="font-mono text-xs text-muted-foreground/70 tabular-nums">{String(i + 1).padStart(2, '0')}</span>
                <span className="truncate text-sm font-medium text-foreground">{risk.factor}</span>
                <span className={cn('shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide', tierBadgeClass(topRiskTier(risk.severity)))}>
                  {risk.severity}
                </span>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <p className="pl-7 text-[13px] leading-relaxed text-muted-foreground">{risk.description}</p>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
