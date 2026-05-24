'use client';

import { cn } from '@/lib/utils';

export function LevelBadge({ level, size = 'sm' }: { level: number; size?: 'sm' | 'lg' }) {
  return (
    <div
      className={cn(
        'inline-flex items-center justify-center rounded-full font-mono font-black text-emerald-500 bg-emerald-500/10 border border-emerald-500/30 tabular-nums shrink-0',
        size === 'sm' ? 'h-6 w-6 text-[11px]' : 'h-10 w-10 text-base'
      )}
      title={`Level ${level}`}
    >
      {level}
    </div>
  );
}
