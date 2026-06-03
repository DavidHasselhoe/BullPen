'use client';

import { useState } from 'react';
import { Pause, Play, Trash2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { describeAlert, type UserAlert } from '@/types/alerts';

interface Props {
  alert: UserAlert;
  onToggle: (id: string, isActive: boolean) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

function formatRelativeTime(iso: string | null): string {
  if (!iso) return 'Never triggered';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return 'Just now';
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

/** Compact sub-row inside a grouped stock card. No logo/company — those live in the group header. */
export function AlertCard({ alert, onToggle, onDelete }: Props) {
  const [busy, setBusy] = useState<'toggle' | 'delete' | null>(null);

  const triggeredRecently =
    alert.lastTriggeredAt !== null &&
    Date.now() - new Date(alert.lastTriggeredAt).getTime() < 24 * 60 * 60 * 1000;

  const handleToggle = async () => {
    setBusy('toggle');
    try { await onToggle(alert.id, !alert.isActive); } finally { setBusy(null); }
  };
  const handleDelete = async () => {
    setBusy('delete');
    try { await onDelete(alert.id); } finally { setBusy(null); }
  };

  return (
    <div className={cn('flex items-center gap-2.5 py-2 px-3', !alert.isActive && 'opacity-60')}>
      {/* Status dot */}
      <span
        className={cn(
          'h-1.5 w-1.5 shrink-0 rounded-full',
          !alert.isActive
            ? 'bg-muted-foreground/30'
            : triggeredRecently
              ? 'bg-amber-400 animate-pulse'
              : 'bg-emerald-500'
        )}
      />

      {/* Description + last triggered */}
      <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
        <span className="text-xs font-mono text-foreground/90">{describeAlert(alert)}</span>
        <span className="text-[10px] text-muted-foreground/45">
          {formatRelativeTime(alert.lastTriggeredAt)}
        </span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-0.5 shrink-0">
        <button
          type="button"
          onClick={handleToggle}
          disabled={busy !== null}
          className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground/40 hover:text-foreground hover:bg-muted/60 transition-colors"
          title={alert.isActive ? 'Pause' : 'Resume'}
        >
          {busy === 'toggle'
            ? <Loader2 className="h-3 w-3 animate-spin" />
            : alert.isActive ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={busy !== null}
          className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground/40 hover:text-red-400 hover:bg-red-500/10 transition-colors"
          title="Delete"
        >
          {busy === 'delete'
            ? <Loader2 className="h-3 w-3 animate-spin" />
            : <Trash2 className="h-3 w-3" />}
        </button>
      </div>
    </div>
  );
}
