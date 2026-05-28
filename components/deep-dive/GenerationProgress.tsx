'use client';

import { useEffect, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  status: string;        // human-readable current step
  thinkingText: string;  // live reasoning stream from the model
  ticker: string;
}

const STEPS = ['Reading fundamentals', 'Researching the web', 'Reasoning', 'Composing report'];

/** Maps the live status string to the furthest step reached, so the stepper only advances. */
function stepIndex(status: string): number {
  if (/compos/i.test(status)) return 3;
  if (/reason|analy|think/i.test(status)) return 2;
  if (/search|web|research/i.test(status)) return 1;
  return 0;
}

export function GenerationProgress({ status, thinkingText, ticker }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const reached = stepIndex(status);

  // Keep the reasoning stream pinned to the latest text.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [thinkingText]);

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-6 sm:p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 shrink-0">
            <Sparkles className="h-5 w-5 text-primary motion-safe:animate-pulse" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">Analyzing ${ticker}</p>
            <p className="text-xs text-muted-foreground flex items-center gap-1.5" role="status" aria-live="polite">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary motion-safe:animate-pulse" />
              {status}
            </p>
          </div>
        </div>

        {/* Stepper */}
        <div className="flex items-center gap-1.5 mb-6" aria-hidden>
          {STEPS.map((label, i) => (
            <div key={label} className="flex-1">
              <div
                className={cn(
                  'h-1 rounded-full transition-colors duration-500',
                  i < reached ? 'bg-primary' : i === reached ? 'bg-primary/50' : 'bg-muted',
                )}
              />
              <p className={cn('text-[9px] mt-1 truncate', i <= reached ? 'text-muted-foreground' : 'text-muted-foreground/40')}>
                {label}
              </p>
            </div>
          ))}
        </div>

        {/* Live reasoning stream */}
        {thinkingText ? (
          <div
            ref={scrollRef}
            className="relative max-h-48 overflow-y-auto rounded-lg border border-border/40 bg-muted/20 p-3.5"
          >
            <p className="text-xs text-muted-foreground/80 leading-relaxed whitespace-pre-wrap font-mono">
              {thinkingText}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {[100, 92, 96].map((w, i) => (
              <div key={i} className="h-3 rounded bg-muted motion-safe:animate-pulse" style={{ width: `${w}%` }} />
            ))}
          </div>
        )}

        <p className="text-[10px] text-muted-foreground/50 mt-4 text-center">
          This usually takes 20–40 seconds. We research current results, guidance, and analyst views.
        </p>
      </CardContent>
    </Card>
  );
}
