'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Bell, Plus, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAuth } from '@/hooks/use-auth';
import { useBackground } from '@/hooks/use-background';
import { humanizeError } from '@/lib/errors/humanize';
import { cn } from '@/lib/utils';
import { CreateAlertForm } from '@/components/alerts/CreateAlertForm';
import { AlertList } from '@/components/alerts/AlertList';
import { FREE_ACTIVE_ALERT_LIMIT, type AlertType } from '@/types/alerts';
import { useAlerts } from '@/hooks/use-alerts';

export default function AlertsClientPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { hasAnimatedBackground } = useBackground();

  // When arriving from the command palette (?symbol=NVDA&name=NVIDIA+Corporation),
  // open the composer immediately. useState initializer runs once so this is safe.
  const prefilledSymbol = searchParams.get('symbol')?.toUpperCase() ?? null;
  const prefilledName = searchParams.get('name') ?? prefilledSymbol ?? null;
  const [composerOpen, setComposerOpen] = useState(() => !!prefilledSymbol);

  // Optional pre-fill from the chart's alert tool (?price=200&type=price_above).
  const rawType = searchParams.get('type');
  const initialAlertType: AlertType | undefined =
    rawType === 'price_above' || rawType === 'price_below' ? rawType : undefined;
  const rawPrice = parseFloat(searchParams.get('price') ?? '');
  const initialThreshold = Number.isFinite(rawPrice) && rawPrice > 0 ? rawPrice : undefined;

  const { alerts, activeSymbolCount, isLoading, isError, error, refetch, create, toggle, remove } = useAlerts();

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

          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/illustrations/bull-alert.png"
                alt=""
                aria-hidden
                className="hidden sm:block h-20 w-20 shrink-0 select-none opacity-90 dark:opacity-80 dark:invert"
              />
              <div className="min-w-0">
                <h1 className="text-2xl font-bold tracking-tight">Price Alerts</h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Get notified when a stock hits a target price, daily move, 52-week extreme, or new high.
                </p>
              </div>
            </div>

            {/* Quota + new-alert button */}
            <div className="flex flex-col items-end gap-2 shrink-0">
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
              {!isLoading && (
                <div className="hidden sm:flex items-center gap-1.5 whitespace-nowrap">
                  <div className="h-1 w-14 rounded-full bg-muted/60 overflow-hidden">
                    <div
                      className={cn(
                        'h-full rounded-full transition-[width] duration-300',
                        activeSymbolCount >= FREE_ACTIVE_ALERT_LIMIT ? 'bg-amber-400' : 'bg-primary/70'
                      )}
                      style={{ width: `${Math.min(100, (activeSymbolCount / FREE_ACTIVE_ALERT_LIMIT) * 100)}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-mono text-muted-foreground/85 tabular-nums">
                    {activeSymbolCount}/{FREE_ACTIVE_ALERT_LIMIT}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Composer */}
        {composerOpen && (
          <CreateAlertForm
            onCreated={() => setComposerOpen(false)}
            onCancel={() => setComposerOpen(false)}
            onCreate={create}
            initialTicker={prefilledSymbol && prefilledName
              ? { ticker: prefilledSymbol, name: prefilledName }
              : undefined}
            initialAlertType={initialAlertType}
            initialThreshold={initialThreshold}
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
            <AlertCircle className="h-8 w-8 text-muted-foreground/80" />
            <p className="text-sm text-muted-foreground">{humanizeError(error)}</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>Try again</Button>
          </div>
        ) : alerts.length === 0 ? (
          // Empty state
          <div className="rounded-2xl border border-border/30 border-dashed py-12 px-6">
            <EmptyState
              pose="alert"
              imageSize={168}
              title="No alerts yet"
              description="Pick a stock and set your first threshold. We'll ping you the moment it triggers."
            >
              {!composerOpen && (
                <div className="flex justify-center">
                  <Button
                    size="sm"
                    onClick={() => setComposerOpen(true)}
                    className="gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Create your first alert
                  </Button>
                </div>
              )}
            </EmptyState>
          </div>
        ) : (
          <AlertList alerts={alerts} onToggle={toggle} onDelete={remove} />
        )}

        {/* About */}
        <div className="border-t border-border/30 pt-5 px-1">
          <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground/80 mb-2">
            About alerts
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground/80">
            Alerts are checked at <span className="font-mono text-muted-foreground/85">market open</span>{' '}
            and once every hour through close (Mon–Fri). Each alert can fire at most{' '}
            <span className="font-mono text-muted-foreground/85">once per 24 hours</span> so you&apos;re never spammed.
            Pause one to silence it without losing the configuration.
          </p>
        </div>
      </div>
    </div>
  );
}
