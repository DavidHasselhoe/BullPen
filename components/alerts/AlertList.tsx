'use client';

import { useState } from 'react';
import { AlertCard } from './AlertCard';
import { cn } from '@/lib/utils';
import type { UserAlert } from '@/types/alerts';

type Filter = 'all' | 'active' | 'paused';

interface Props {
  alerts: UserAlert[];
  onToggle: (id: string, isActive: boolean) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export function AlertList({ alerts, onToggle, onDelete }: Props) {
  const [filter, setFilter] = useState<Filter>('all');

  const activeCount = alerts.filter((a) => a.isActive).length;
  const pausedCount = alerts.length - activeCount;

  const filtered = alerts.filter((a) =>
    filter === 'all' ? true : filter === 'active' ? a.isActive : !a.isActive
  );

  return (
    <div className="space-y-3">
      {/* Section header + filter chips */}
      <div className="flex items-center justify-between gap-3 px-1">
        <div className="flex items-baseline gap-2">
          <h2 className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground/55">
            Your alerts
          </h2>
          <span className="text-[10px] font-mono text-muted-foreground/35">
            {activeCount} active
            {pausedCount > 0 && ` · ${pausedCount} paused`}
          </span>
        </div>
        <div className="flex items-center gap-0.5 rounded-md border border-border/40 bg-card/30 p-0.5">
          {(['all', 'active', 'paused'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={cn(
                'text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded transition-colors',
                filter === f
                  ? 'bg-foreground/10 text-foreground'
                  : 'text-muted-foreground/55 hover:text-foreground'
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-border/30 border-dashed py-10 text-center">
          <p className="text-xs text-muted-foreground/55">
            {filter === 'paused' ? 'No paused alerts.' : 'No alerts in this view.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((alert) => (
            <AlertCard
              key={alert.id}
              alert={alert}
              onToggle={onToggle}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
