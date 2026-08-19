'use client';

import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import type { Portfolio } from '@/lib/ai/portfolio-builder/schema';

interface Props {
  portfolio: Portfolio;
}

/** Transparency notes, mirroring Risk Analysis's AIAssessment section —
 *  progressive disclosure for the "why" behind the headline numbers. */
export function PortfolioNotes({ portfolio }: Props) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-foreground">Notes</h3>
      <Accordion type="single" collapsible className="border-t border-border/20">
        <AccordionItem value="confidence" className="border-border/20">
          <AccordionTrigger className="py-3 hover:no-underline">
            <span className="text-sm text-foreground">Why this confidence score</span>
          </AccordionTrigger>
          <AccordionContent>
            <p className="text-[13px] leading-relaxed text-muted-foreground">{portfolio.confidence_rationale}</p>
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="diversification" className="border-border/20">
          <AccordionTrigger className="py-3 hover:no-underline">
            <span className="text-sm text-foreground">Diversification</span>
          </AccordionTrigger>
          <AccordionContent>
            <p className="text-[13px] leading-relaxed text-muted-foreground">{portfolio.diversification_analysis}</p>
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="rebalance" className="border-border/20">
          <AccordionTrigger className="py-3 hover:no-underline">
            <span className="text-sm text-foreground">When to revisit</span>
          </AccordionTrigger>
          <AccordionContent>
            <p className="text-[13px] leading-relaxed text-muted-foreground">{portfolio.rebalance_trigger}</p>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
