// components/holdings/risk-analysis/StressScenarios.tsx
'use client';

import { cn } from '@/lib/utils';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import type { StressScenario } from './types';
import { scenarioTier, tierBadgeClass, tierTextClass, splitImpact } from './colors';

interface Props {
  scenarios: StressScenario[];
}

export function StressScenarios({ scenarios }: Props) {
  if (!scenarios?.length) return null;

  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-foreground">Downside scenarios</h3>
      <Accordion type="single" collapsible className="border-t border-border/20">
        {scenarios.map((s, i) => {
          const { figure, rest } = splitImpact(s.estimatedImpact);
          const tier = scenarioTier(s.severity);
          return (
            <AccordionItem key={i} value={String(i)} className="border-border/20">
              <AccordionTrigger className="py-3 hover:no-underline">
                <div className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-foreground">{s.scenario}</div>
                    {figure && (
                      <div className={cn('font-mono text-lg font-bold tabular-nums leading-tight', tierTextClass(tier))}>
                        {figure}
                      </div>
                    )}
                  </div>
                  <span className={cn('shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide', tierBadgeClass(tier))}>
                    {s.severity}
                  </span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <p className="text-[13px] leading-relaxed text-muted-foreground">{rest || s.estimatedImpact}</p>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}
