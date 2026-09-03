'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCw, MessageSquare, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BlockRenderer } from './blocks';
import { DeepDiveHero } from './DeepDiveHero';
import type { DeepDiveReport as Report } from '@/lib/ai/deep-dive/schema';

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

interface Props {
  report: Report;
  createdAt?: string | null;
  onRegenerate?: () => void;
  regenerating?: boolean;
  onAsk?: () => void;
}

// Hierarchy mirrors Risk Analysis's redesign brief: hero/summary -> data-driven
// blocks (this feature's own information architecture — the model decides
// which block types apply, unlike RA's fixed schema) -> footer, using the
// same space-y-7 / border-t rhythm and Generated-· / Ask-Bull footer
// convention as every other AI result surface.
export function DeepDiveReport({ report, createdAt, onRegenerate, regenerating, onAsk }: Props) {
  const when = createdAt ?? report.generatedAt;

  return (
    <Card className="overflow-hidden">
      <CardContent className="px-5 sm:px-6 py-6 space-y-7">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <DeepDiveHero report={report} />
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

        <div className="space-y-7 border-t border-border/20 pt-6">
          {report.blocks.map((block, i) => (
            <BlockRenderer key={i} block={block} />
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/20 pt-6">
          <span className="text-[11px] font-mono uppercase tracking-[0.15em] text-muted-foreground/80">
            Generated · {fmtWhen(when)}
            {report.dataAsOf ? ` · fundamentals as of ${report.dataAsOf}` : ''}
          </span>
          <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground/70">
            <Sparkles className="h-3 w-3" /> Educational only — not investment advice
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
