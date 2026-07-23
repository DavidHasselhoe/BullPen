'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

export type DivePhase = 'reading_data' | 'searching' | 'reasoning' | 'composing';

interface Props {
  phase: DivePhase;
  ticker: string;
}

const STEPS = ['Reading fundamentals', 'Researching the web', 'Reasoning', 'Composing report'];
const PHASE_INDEX: Record<DivePhase, number> = {
  reading_data: 0,
  searching: 1,
  reasoning: 2,
  composing: 3,
};
const PHASE_LABEL: Record<DivePhase, string> = {
  reading_data: 'Reading fundamentals…',
  searching: 'Searching the web for current results…',
  reasoning: 'Reasoning through the analysis…',
  composing: 'Composing the report…',
};

// Rotating hint messages for each step — cycle every 3 s to show the AI is active
const STEP_HINTS: Record<number, string[]> = {
  0: [
    'Pulling quarterly earnings data…',
    'Reading balance sheet metrics…',
    'Reviewing valuation ratios…',
    'Checking cash flow statements…',
    'Loading analyst estimates…',
  ],
  1: [
    'Searching for recent news…',
    'Finding analyst price targets…',
    'Checking earnings guidance…',
    'Looking for macro headwinds…',
    'Scanning recent filings…',
  ],
  2: [
    'Weighing bull vs bear case…',
    'Evaluating key catalysts…',
    'Assessing risk factors…',
    'Building the investment thesis…',
    'Cross-checking data points…',
  ],
  3: [
    'Structuring the deep dive…',
    'Writing the executive summary…',
    'Crafting the risk section…',
    'Finalising insights…',
    'Polishing the report…',
  ],
};

function useElapsed() {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const m = Math.floor(elapsed / 60);
  const s = elapsed % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function useRotatingHint(stepIdx: number): string {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 3000);
    return () => clearInterval(id);
  }, []);
  const hints = STEP_HINTS[stepIdx] ?? STEP_HINTS[0];
  return hints[tick % hints.length] ?? hints[0];
}

export function GenerationProgress({ phase, ticker }: Props) {
  const reached = PHASE_INDEX[phase];
  const elapsed = useElapsed();
  const hint = useRotatingHint(reached);

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-6 sm:p-8">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 shrink-0">
              <Sparkles className="h-5 w-5 text-primary" />
              {/* Outer ring pulse */}
              <span className="absolute inset-0 rounded-xl bg-primary/10 animate-ping opacity-60" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">Analyzing ${ticker}</p>
              <p
                className="text-xs text-muted-foreground flex items-center gap-1.5 transition-all duration-500"
                role="status"
                aria-live="polite"
              >
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                <span className="truncate">{PHASE_LABEL[phase]}</span>
              </p>
            </div>
          </div>
          {/* Elapsed timer */}
          <span className="text-[11px] font-mono text-muted-foreground/50 shrink-0 tabular-nums">
            {elapsed}
          </span>
        </div>

        {/* Stepper */}
        <div className="flex items-start gap-1.5 mb-5" aria-hidden>
          {STEPS.map((label, i) => {
            const isActive = i === reached;
            const isDone = i < reached;
            return (
              <div key={label} className="flex-1">
                <div className="relative h-1 rounded-full overflow-hidden">
                  {/* Base track */}
                  <div className={cn(
                    'absolute inset-0 rounded-full transition-colors duration-500',
                    isDone ? 'bg-primary' : isActive ? 'bg-primary/30' : 'bg-muted',
                  )} />
                  {/* Shimmer sweep on active step */}
                  {isActive && (
                    <div className="absolute inset-0 rounded-full overflow-hidden">
                      <div
                        className="absolute inset-y-0 w-1/2 bg-gradient-to-r from-transparent via-primary/70 to-transparent"
                        style={{ animation: 'shimmerSweep 1.6s ease-in-out infinite' }}
                      />
                    </div>
                  )}
                </div>
                <p className={cn(
                  'text-[9px] mt-1 truncate transition-colors duration-300',
                  isDone ? 'text-muted-foreground' : isActive ? 'text-foreground/70' : 'text-muted-foreground/35',
                )}>
                  {label}
                </p>
              </div>
            );
          })}
        </div>

        {/* Rotating contextual hint */}
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-border/30 bg-muted/20 px-3 py-2">
          <span className="flex gap-[3px] items-end shrink-0 h-4">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="inline-block w-0.5 rounded-full bg-primary/60"
                style={{
                  height: '10px',
                  animation: `barBounce 1.2s ease-in-out ${i * 0.2}s infinite`,
                }}
              />
            ))}
          </span>
          <p
            key={hint}
            className="text-[11px] text-muted-foreground/80 truncate transition-all duration-500 animate-in fade-in slide-in-from-bottom-1"
          >
            {hint}
          </p>
        </div>

        {/* Decorative skeleton — replaces the old live token stream, which can't
            survive the user navigating away (see runDeepDive in the API route). */}
        <div className="space-y-2">
          {[100, 88, 94].map((w, i) => (
            <div
              key={i}
              className="relative h-2.5 rounded-full bg-muted overflow-hidden"
              style={{ width: `${w}%`, animationDelay: `${i * 0.15}s` }}
            >
              <div
                className="absolute inset-0 bg-gradient-to-r from-transparent via-muted-foreground/15 to-transparent"
                style={{ animation: `shimmerSweep ${1.8 + i * 0.2}s ease-in-out ${i * 0.25}s infinite` }}
              />
            </div>
          ))}
        </div>

        <p className="text-[10px] text-muted-foreground/50 mt-4 text-center">
          This usually takes 20–40 seconds. Feel free to leave this page — we&apos;ll notify you when it&apos;s ready.
        </p>
      </CardContent>

      {/* CSS keyframes injected inline */}
      <style>{`
        @keyframes shimmerSweep {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(300%); }
        }
        @keyframes barBounce {
          0%, 100% { transform: scaleY(0.4); opacity: 0.5; }
          50%       { transform: scaleY(1);   opacity: 1; }
        }
      `}</style>
    </Card>
  );
}
