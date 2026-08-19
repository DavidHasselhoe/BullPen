'use client';

import { cn } from '@/lib/utils';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import { tierBadgeClass } from '@/lib/ui/severity-tiers';
import type { PortfolioRisk } from '@/lib/ai/portfolio-builder/schema';
import { riskLevelTier } from './colors';

interface Props {
  risks: PortfolioRisk[];
}

export function KeyRisks({ risks }: Props) {
  if (!risks?.length) return null;

  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-foreground">Key risks</h3>
      <Accordion type="single" collapsible className="border-t border-border/20">
        {risks.map((risk, i) => (
          <AccordionItem key={i} value={String(i)} className="border-border/20">
            <AccordionTrigger className="py-3 hover:no-underline">
              <div className="flex min-w-0 items-baseline gap-3 text-left">
                <span className="font-mono text-xs text-muted-foreground/70 tabular-nums">{String(i + 1).padStart(2, '0')}</span>
                <span className="truncate text-sm font-medium text-foreground">{risk.title}</span>
                <span className={cn('shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide', tierBadgeClass(riskLevelTier(risk.severity)))}>
                  {risk.severity}
                </span>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <div className="pl-7 space-y-2">
                <p className="text-[13px] leading-relaxed text-muted-foreground">{risk.description}</p>
                {risk.affected_holdings.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {risk.affected_holdings.map((tk) => (
                      <span key={tk} className="rounded bg-muted/50 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground/85">
                        {tk}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
