'use client';

import { useState } from 'react';
import { Pause, Play, Trash2, Loader2 } from 'lucide-react';
import { CompanyLogo } from '@/components/company/CompanyLogo';
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
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

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
    <div
      className={cn(
        'flex items-center gap-3 rounded-2xl border bg-card/30 px-4 py-3.5 transition-[border-color,opacity] duration-200',
        alert.isActive ? 'border-border/50' : 'border-border/30 opacity-75',
        'hover:border-border/80'
      )}
    >
      {/* Status dot */}
      <span
        className={cn(
          'h-2 w-2 shrink-0 rounded-full',
          !alert.isActive
            ? 'bg-muted-foreground/30'
            : triggeredRecently
              ? 'bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.6)] animate-pulse'
              : 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]'
        )}
        aria-label={alert.isActive ? 'Active' : 'Paused'}
      />

      {/* Logo */}
      <CompanyLogo
        name={alert.companyName ?? alert.symbol}
        ticker={alert.symbol}
        size={32}
        className="shrink-0"
      />

      {/* Main */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="font-mono font-bold text-sm text-foreground">{alert.symbol}</span>
          {alert.companyName && (
            <span className="text-xs text-muted-foreground/65 truncate">{alert.companyName}</span>
          )}
        </div>
        <div className="text-[11px] text-muted-foreground/70 mt-0.5 flex items-center gap-2 flex-wrap">
          <span className="font-mono">{describeAlert(alert)}</span>
          <span className="text-muted-foreground/30">·</span>
          <span>{formatRelativeTime(alert.lastTriggeredAt)}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-0.5 shrink-0">
        <button
          type="button"
          onClick={handleToggle}
          disabled={busy !== null}
          className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground/55 hover:text-foreground hover:bg-muted/60 transition-colors"
          aria-label={alert.isActive ? 'Pause alert' : 'Resume alert'}
          title={alert.isActive ? 'Pause' : 'Resume'}
        >
          {busy === 'toggle' ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : alert.isActive ? (
            <Pause className="h-3.5 w-3.5" />
          ) : (
            <Play className="h-3.5 w-3.5" />
          )}
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={busy !== null}
          className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground/55 hover:text-red-400 hover:bg-red-500/10 transition-colors"
          aria-label="Delete alert"
          title="Delete"
        >
          {busy === 'delete' ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Trash2 className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
    </div>
  );
}
