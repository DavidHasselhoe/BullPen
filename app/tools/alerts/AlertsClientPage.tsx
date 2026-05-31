'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Bell, Plus, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/use-auth';
import { useBackground } from '@/hooks/use-background';
import { humanizeError } from '@/lib/errors/humanize';
import { cn } from '@/lib/utils';
import { CreateAlertForm } from '@/components/alerts/CreateAlertForm';
import { AlertList } from '@/components/alerts/AlertList';
import { FREE_ACTIVE_ALERT_LIMIT, type CreateAlertPayload, type UserAlert } from '@/types/alerts';

const ALERTS_QUERY_KEY = ['user-alerts'] as const;

interface AlertsResponse {
  success: boolean;
  alerts: UserAlert[];
}

export default function AlertsClientPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { hasAnimatedBackground } = useBackground();
  const [composerOpen, setComposerOpen] = useState(false);

  const { data, isLoading, isError, error, refetch } = useQuery<AlertsResponse>({
    queryKey: ALERTS_QUERY_KEY,
    queryFn: async () => {
      const res = await fetch('/api/alerts');
      if (!res.ok) throw new Error('Failed to load alerts');
      return res.json();
    },
    enabled: isAuthenticated,
    staleTime: 30 * 1000,
  });

  const alerts = data?.alerts ?? [];
  const activeCount = alerts.filter((a) => a.isActive).length;

  const togglePauseMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const res = await fetch(`/api/alerts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive }),
      });
      if (!res.ok) throw new Error('Failed to update alert');
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ALERTS_QUERY_KEY }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/alerts/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete alert');
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ALERTS_QUERY_KEY }),
  });

  const handleToggle = useCallback(
    async (id: string, isActive: boolean) => {
      await togglePauseMutation.mutateAsync({ id, isActive });
    },
    [togglePauseMutation]
  );

  const handleDelete = useCallback(
    async (id: string) => {
      await deleteMutation.mutateAsync(id);
    },
    [deleteMutation]
  );

  const handleCreate = useCallback(
    async (payload: CreateAlertPayload): Promise<{ ok: boolean; error?: string }> => {
      try {
        const res = await fetch('/api/alerts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const body = await res.json();
        if (!res.ok) {
          return { ok: false, error: body?.error || humanizeError(res.status) };
        }
        await queryClient.invalidateQueries({ queryKey: ALERTS_QUERY_KEY });
        return { ok: true };
      } catch (err) {
        return { ok: false, error: humanizeError(err) };
      }
    },
    [queryClient]
  );

  // ── Auth gate ──────────────────────────────────────────────────────────────
  if (!authLoading && !isAuthenticated) {
    return (
      <div className={cn('min-h-screen', !hasAnimatedBackground && 'bg-background')}>
        <div className="max-w-xl mx-auto px-4 py-16 text-center space-y-4">
          <Bell className="h-10 w-10 text-primary/70 mx-auto" />
          <h1 className="text-2xl font-semibold">Sign in to set alerts</h1>
          <p className="text-sm text-muted-foreground">
            Create personal alerts when a stock hits a price, % move, or all-time high.
          </p>
          <Button onClick={() => router.push('/login?redirectTo=/tools/alerts')}>Sign in</Button>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('min-h-screen', !hasAnimatedBackground && 'bg-background')}>
      <div className="max-w-2xl mx-auto px-4 py-6 sm:py-10 space-y-8">

        {/* Header */}
        <div className="pb-4 border-b border-border/30">
          <Link
            href="/tools"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-3 group"
          >
            <ArrowLeft className="h-3 w-3 transition-transform group-hover:-translate-x-0.5" />
            All tools
          </Link>

          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Bell className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0">
                <h1 className="text-2xl font-bold tracking-tight">Price Alerts</h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Get notified when a stock hits a target price, daily move, 52-week extreme, or new high.
                </p>
              </div>
            </div>

            {/* Quota + new-alert button */}
            <div className="flex items-center gap-3 shrink-0">
              {!isLoading && (
                <span className="hidden sm:inline text-xs font-mono text-muted-foreground/50 tabular-nums whitespace-nowrap">
                  {activeCount}/{FREE_ACTIVE_ALERT_LIMIT} used
                </span>
              )}
              {!composerOpen && (
                <Button
                  size="sm"
                  onClick={() => setComposerOpen(true)}
                  className="gap-1.5"
                >
                  <Plus className="h-3.5 w-3.5" />
                  New alert
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Composer */}
        {composerOpen && (
          <CreateAlertForm
            onCreated={() => setComposerOpen(false)}
            onCancel={() => setComposerOpen(false)}
            onCreate={handleCreate}
          />
        )}

        {/* Body */}
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-4 w-32" />
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-[68px] rounded-2xl" />
            ))}
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <AlertCircle className="h-8 w-8 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">{humanizeError(error)}</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>Try again</Button>
          </div>
        ) : alerts.length === 0 ? (
          // Empty state
          <div className="rounded-2xl border border-border/30 border-dashed py-14 text-center px-6">
            <div className="h-14 w-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center mx-auto mb-4">
              <Bell className="h-7 w-7 text-emerald-500" />
            </div>
            <h2 className="text-base font-semibold mb-1.5">No alerts yet</h2>
            <p className="text-xs text-muted-foreground/65 mb-4 max-w-xs mx-auto">
              Pick a stock and set your first threshold. We&apos;ll ping you when it triggers.
            </p>
            {!composerOpen && (
              <Button
                size="sm"
                onClick={() => setComposerOpen(true)}
                className="gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white"
              >
                <Plus className="h-3.5 w-3.5" />
                Create your first alert
              </Button>
            )}
          </div>
        ) : (
          <AlertList alerts={alerts} onToggle={handleToggle} onDelete={handleDelete} />
        )}

        {/* About */}
        <div className="border-t border-border/30 pt-5 px-1">
          <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground/45 mb-2">
            About alerts
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground/55">
            Alerts are checked at <span className="font-mono text-muted-foreground/75">market open</span>{' '}
            and once every hour through close (Mon–Fri). Each alert can fire at most{' '}
            <span className="font-mono text-muted-foreground/75">once per 24 hours</span> so you&apos;re never spammed.
            Pause one to silence it without losing the configuration.
          </p>
        </div>
      </div>
    </div>
  );
}
