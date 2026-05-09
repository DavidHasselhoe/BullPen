'use client';

import { useEffect, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Brain, Layers, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  text: string;
  phase: 'streaming' | 'composing' | 'validating';
}

const STEPS = [
  { key: 'streaming', icon: Brain,        label: 'Analyzing thesis' },
  { key: 'composing', icon: Layers,       label: 'Composing portfolio' },
  { key: 'validating', icon: ShieldCheck, label: 'Validating tickers' },
] as const;

const PHASE_ORDER: Record<Props['phase'], number> = {
  streaming: 0,
  composing: 1,
  validating: 2,
};

export function StreamingThoughts({ text, phase }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const currentStep = PHASE_ORDER[phase];

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [text]);

  return (
    <Card className="border-border/60 overflow-hidden">
      <CardContent className="pt-5 pb-5 space-y-4">

        {/* Step progress */}
        <div className="flex items-center gap-0">
          {STEPS.map((step, i) => {
            const isDone    = i < currentStep;
            const isActive  = i === currentStep;
            const isPending = i > currentStep;
            const Icon = isDone ? CheckCircle2 : step.icon;

            return (
              <div key={step.key} className="flex items-center flex-1 min-w-0">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Icon
                    className={cn(
                      'h-3.5 w-3.5 shrink-0 transition-colors duration-300',
                      isDone    && 'text-emerald-400',
                      isActive  && 'text-primary animate-pulse',
                      isPending && 'text-muted-foreground/25',
                    )}
                  />
                  <span
                    className={cn(
                      'text-[10px] font-semibold uppercase tracking-widest truncate transition-colors duration-300',
                      isDone    && 'text-emerald-400/70',
                      isActive  && 'text-foreground/80',
                      isPending && 'text-muted-foreground/25',
                    )}
                  >
                    {step.label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div
                    className={cn(
                      'mx-2 flex-1 h-px transition-colors duration-500 shrink-0 max-w-8',
                      i < currentStep ? 'bg-emerald-500/40' : 'bg-border/30',
                    )}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Thinking stream */}
        <div
          ref={scrollRef}
          className="relative max-h-[380px] overflow-y-auto rounded-xl bg-muted/20 border border-border/30 p-4 text-sm leading-relaxed text-foreground/75 font-mono scroll-smooth"
        >
          <div className="whitespace-pre-wrap break-words">
            {text || (
              <span className="text-muted-foreground/40 italic">
                Decomposing the thesis into investable subsectors…
              </span>
            )}
            {phase === 'streaming' && (
              <span className="inline-block h-3.5 w-0.5 bg-primary/60 animate-pulse ml-0.5 align-middle" />
            )}
          </div>
        </div>

      </CardContent>
    </Card>
  );
}
