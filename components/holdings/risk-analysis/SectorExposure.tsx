// components/holdings/risk-analysis/SectorExposure.tsx
'use client';

import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import type { RiskAnalysis } from './types';

interface Props {
  sectors: RiskAnalysis['sectorBreakdown'];
}

export function SectorExposure({ sectors }: Props) {
  if (!sectors?.length) return null;
  const sorted = [...sectors].sort((a, b) => b.estimatedWeight - a.estimatedWeight);

  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-foreground">Sector exposure</h3>
      <Accordion type="single" collapsible className="border-t border-border/20">
        {sorted.map((s) => (
          <AccordionItem key={s.sector} value={s.sector} className="border-border/20">
            <AccordionTrigger className="py-3 hover:no-underline">
              <div className="flex flex-1 items-center gap-3 pr-2">
                <span className="min-w-0 flex-1 truncate text-left text-sm text-foreground">{s.sector}</span>
                <div className="h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-muted/40">
                  <div className="h-full rounded-full bg-foreground/40" style={{ width: `${Math.min(s.estimatedWeight, 100)}%` }} />
                </div>
                <span className="w-10 shrink-0 text-right font-mono text-sm font-semibold tabular-nums text-foreground">
                  {s.estimatedWeight.toFixed(0)}%
                </span>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <div className="flex flex-wrap gap-1.5">
                {s.symbols.map((sym) => (
                  <span key={sym} className="rounded bg-muted/50 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground/85">
                    {sym}
                  </span>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
