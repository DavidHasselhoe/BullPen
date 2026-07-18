'use client';

import { cn } from '@/lib/utils';
import { CardShell } from './CardPrimitives';

export interface HealthScoreOutput {
  ticker: string;
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  categories: Array<{ name: string; score: number; max: number; label: string }>;
}

function gradeBadgeClass(grade: string): string {
  if (grade === 'A' || grade === 'B') return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
  if (grade === 'C') return 'bg-amber-400/10 text-amber-400 border-amber-400/20';
  return 'bg-red-500/10 text-red-500 border-red-500/20';
}

function barColor(ratio: number): string {
  if (ratio >= 0.7) return 'bg-emerald-500';
  if (ratio >= 0.45) return 'bg-amber-400';
  return 'bg-red-500';
}

export function HealthScoreResultCard({ output }: { output: HealthScoreOutput }) {
  return (
    <CardShell>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="font-semibold text-foreground">{output.ticker} Financial Health</span>
        <span className={cn('shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold', gradeBadgeClass(output.grade))}>
          {output.score}/100 · {output.grade}
        </span>
      </div>
      <div className="space-y-1.5">
        {output.categories.map((c) => {
          const unavailable = c.label?.startsWith('N/A');
          const ratio = c.max > 0 ? c.score / c.max : 0;
          return (
            <div key={c.name} className="space-y-0.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground">{c.name}</span>
                <span className="tabular-nums text-muted-foreground">{unavailable ? 'N/A' : `${c.score}/${c.max}`}</span>
              </div>
              {!unavailable && (
                <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
                  <div className={cn('h-full rounded-full', barColor(ratio))} style={{ width: `${ratio * 100}%` }} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </CardShell>
  );
}
