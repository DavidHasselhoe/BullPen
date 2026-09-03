'use client';

import dynamic from 'next/dynamic';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCw, MessageSquare, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BlockRenderer } from './blocks';
import { DeepDiveHero } from './DeepDiveHero';
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

// Hierarchy mirrors Risk Analysis's redesign brief: hero/summary -> price
// chart -> data-driven blocks (this feature's own information architecture —
// the model decides which block types apply, unlike RA's fixed schema) ->
// footer. Staleness + the AI-generated disclaimer moved up into the hero's
// meta line (directly under the verdict badge) since burying them in tiny
// text at the very bottom of a five-screen report meant nobody saw them;
// the footer disclaimer stays too as cheap, low-risk redundancy for
// legally-sensitive copy.
export function DeepDiveReport({ report, createdAt, onRegenerate, regenerating, onAsk }: Props) {
  const when = createdAt ?? report.generatedAt;

  return (
    <Card className="overflow-hidden">
      <CardContent className="px-5 sm:px-6 py-6 space-y-7">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <DeepDiveHero report={report} when={when} />
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
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
          </div>
        </div>

        <StockPricePanel ticker={report.ticker} />

        <div className="space-y-7 border-t border-border/20 pt-6">
          {report.blocks.map((block, i) => (
            <BlockRenderer key={i} block={block} />
          ))}
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
