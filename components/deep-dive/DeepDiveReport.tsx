'use client';

import dynamic from 'next/dynamic';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCw, MessageSquare, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DeepDiveHero } from './DeepDiveHero';
import { ThreeThings } from './ThreeThings';
import { DeepDiveSections } from './DeepDiveSections';
import type { DeepDiveReport as Report } from '@/lib/ai/deep-dive/schema';

const StockPricePanel = dynamic(
  () => import('@/components/stock/StockPricePanel').then((m) => ({ default: m.StockPricePanel })),
  { ssr: false, loading: () => <div className="mb-2 h-[340px] animate-shimmer rounded-2xl" /> }
);

interface Props {
  report: Report;
  createdAt?: string | null;
  onRegenerate?: () => void;
  regenerating?: boolean;
  onAsk?: () => void;
}

// Three layers, in the order a reader needs them:
//   1. DeepDiveHero    verdict, health score, price, one sentence
//   2. ThreeThings     growth / biggest risk / what to watch next
//   3. DeepDiveSections everything else, grouped and collapsed by default
// with the price chart between 2 and 3. The point of the split is that the
// answer to "should I buy this" is readable without scrolling past a single
// table, while every table is still one click away.
//
// Staleness and the AI-generated disclaimer live in the hero's meta line,
// since burying them at the bottom of a five-screen report meant nobody saw
// them; the footer disclaimer stays as cheap redundancy for legally
// sensitive copy.
export function DeepDiveReport({ report, createdAt, onRegenerate, regenerating, onAsk }: Props) {
  const when = createdAt ?? report.generatedAt;

  return (
    <Card className="overflow-hidden">
      <CardContent className="px-5 sm:px-6 py-6 space-y-7">
        {/* The actions belong to the hero's own top row, not to a flex sibling
            wrapping the whole hero. As siblings they reserved their width down
            the hero's entire height, so the verdict bar and the prose under it
            were squeezed to about two thirds of the card with dead space
            beside them. */}
        <DeepDiveHero
          report={report}
          when={when}
          actions={
            <>
              {onAsk && (
                <Button variant="outline" size="sm" onClick={onAsk} className="h-8 gap-1.5 text-xs">
                  <MessageSquare className="h-3.5 w-3.5" /> Ask Bull
                </Button>
              )}
              {onRegenerate && (
                <Button size="sm" onClick={onRegenerate} disabled={regenerating} className="h-8 gap-1.5 text-xs rounded-full animate-ai-pill-shine">
                  <RefreshCw className={cn('h-3.5 w-3.5', regenerating && 'animate-spin')} /> Regenerate
                </Button>
              )}
            </>
          }
        />

        <ThreeThings report={report} />

        <StockPricePanel ticker={report.ticker} />

        <div className="border-t border-border/20 pt-6">
          <DeepDiveSections report={report} />
        </div>

        <div className="flex justify-end border-t border-border/20 pt-6">
          <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground/70">
            <Sparkles className="h-3 w-3" /> Educational only — not investment advice
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
