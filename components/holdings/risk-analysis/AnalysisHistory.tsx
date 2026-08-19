// components/holdings/risk-analysis/AnalysisHistory.tsx
'use client';

import { Trash2, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Sparkline } from '@/components/viz/Sparkline';
import type { SavedRiskAnalysis } from '@/app/api/holdings/risk-analysis/history/route';
import { levelTier, tierTextClass } from './colors';

interface Props {
  items: SavedRiskAnalysis[];
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
}

function formatAgo(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function AnalysisHistory({ items, onRestore, onDelete }: Props) {
  if (items.length === 0) return null;
  // history is created_at DESC (history/route.ts:28) — Sparkline wants oldest->newest.
  const scoresOldestFirst = [...items].reverse().map((h) => h.overallRiskScore);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <Clock className="h-3 w-3 text-muted-foreground/70" />
          <h3 className="text-sm font-semibold text-foreground">Analysis history</h3>
        </div>
        {scoresOldestFirst.length >= 2 && (
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground/60">Trend</span>
            <Sparkline
              data={scoresOldestFirst}
              direction="neutral"
              width={80}
              height={24}
              area
              ariaLabel="Risk score trend across saved analyses"
            />
          </div>
        )}
      </div>
      <div className="space-y-1">
        {items.map((item) => (
          <div key={item.id} className="group flex items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-muted/30">
            <button onClick={() => onRestore(item.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
              <span className={cn('font-mono text-sm font-semibold tabular-nums', tierTextClass(levelTier(item.riskLevel)))}>
                {item.overallRiskScore}
              </span>
              <span className="text-[13px] text-muted-foreground">{item.riskLevel}</span>
              <span className="ml-auto shrink-0 text-[12px] tabular-nums text-muted-foreground/70">{formatAgo(item.createdAt)}</span>
            </button>
            <button
              onClick={() => onDelete(item.id)}
              aria-label="Delete this saved analysis"
              className="shrink-0 rounded p-1 opacity-0 transition-opacity hover:bg-red-500/10 group-hover:opacity-100"
            >
              <Trash2 className="h-3.5 w-3.5 text-muted-foreground/70 hover:text-red-400" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
