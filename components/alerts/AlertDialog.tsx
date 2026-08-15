'use client';

import { useState } from 'react';
import { Bell, Plus, ExternalLink, Pause, Play, Trash2, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { CreateAlertForm } from './CreateAlertForm';
import { describeAlert } from '@/types/alerts';
import { useAlerts } from '@/hooks/use-alerts';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';

interface Props {
  symbol: string;
  companyName?: string;
  /** Rendered as the trigger. Defaults to a bell icon button. */
  trigger?: React.ReactNode;
}

export function AlertDialog({ symbol, companyName, trigger }: Props) {
  const { isAuthenticated } = useAuth();
  const { alerts, isLoading, create, toggle, remove } = useAlerts();
  const [composerOpen, setComposerOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const tickerAlerts = alerts.filter(
    (a) => a.symbol.toUpperCase() === symbol.toUpperCase()
  );
  const activeCount = tickerAlerts.filter((a) => a.isActive).length;

  const handleToggle = async (id: string, isActive: boolean) => {
    setBusy(id);
    try { await toggle(id, isActive); } finally { setBusy(null); }
  };

  const handleDelete = async (id: string) => {
    setBusy(`del-${id}`);
    try { await remove(id); } finally { setBusy(null); }
  };

  const triggerEl = trigger ?? (
    <Button
      variant="outline"
      size="sm"
      className={cn('gap-2 relative', activeCount > 0 && 'border-emerald-500/40 text-emerald-600 dark:text-emerald-400')}
    >
      <Bell className="h-4 w-4" />
      Alert
      {activeCount > 0 && (
        <span className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-emerald-500 text-[11px] font-bold text-white flex items-center justify-center">
          {activeCount}
        </span>
      )}
    </Button>
  );

  return (
    <Dialog onOpenChange={(open) => { if (!open) setComposerOpen(false); }}>
      <DialogTrigger asChild>{triggerEl}</DialogTrigger>

      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Bell className="h-4 w-4 text-emerald-500" />
            Alerts for <span className="font-mono">{symbol}</span>
          </DialogTitle>
        </DialogHeader>

        {!isAuthenticated ? (
          <div className="py-6 text-center space-y-3">
            <p className="text-sm text-muted-foreground">Sign in to create price alerts.</p>
            <Button asChild size="sm">
              <Link href={`/login?redirectTo=/stock/${symbol}`}>Sign in</Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Existing alerts for this ticker */}
            {!isLoading && tickerAlerts.length > 0 && (
              <div className="space-y-2">
                {tickerAlerts.map((alert) => {
                  const isBusy = busy === alert.id || busy === `del-${alert.id}`;
                  const triggered =
                    alert.lastTriggeredAt !== null &&
                    Date.now() - new Date(alert.lastTriggeredAt).getTime() < 86_400_000;
                  return (
                    <div
                      key={alert.id}
                      className={cn(
                        'flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-opacity',
                        alert.isActive ? 'border-border/50' : 'border-border/30 opacity-60'
                      )}
                    >
                      <span
                        className={cn(
                          'h-2 w-2 shrink-0 rounded-full',
                          !alert.isActive
                            ? 'bg-muted-foreground/30'
                            : triggered
                              ? 'bg-amber-400 animate-pulse'
                              : 'bg-emerald-500'
                        )}
                      />
                      <span className="flex-1 text-xs font-mono text-muted-foreground">
                        {describeAlert(alert)}
                      </span>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleToggle(alert.id, !alert.isActive)}
                          className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground/85 hover:text-foreground hover:bg-muted/60 transition-colors"
                          title={alert.isActive ? 'Pause' : 'Resume'}
                        >
                          {isBusy && busy === alert.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : alert.isActive ? (
                            <Pause className="h-3 w-3" />
                          ) : (
                            <Play className="h-3 w-3" />
                          )}
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleDelete(alert.id)}
                          className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground/85 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                          title="Delete"
                        >
                          {isBusy && busy === `del-${alert.id}` ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Trash2 className="h-3 w-3" />
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Create form or Add button */}
            {composerOpen ? (
              <CreateAlertForm
                initialTicker={{ ticker: symbol, name: companyName ?? symbol }}
                onCreate={create}
                onCreated={() => setComposerOpen(false)}
                onCancel={() => setComposerOpen(false)}
              />
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-2 border-dashed"
                onClick={() => setComposerOpen(true)}
              >
                <Plus className="h-3.5 w-3.5" />
                {tickerAlerts.length === 0 ? 'Create alert' : 'Add another alert'}
              </Button>
            )}

            {/* Link to full alerts page */}
            {tickerAlerts.length > 0 && (
              <div className="pt-1 border-t border-border/30">
                <Link
                  href="/tools/alerts"
                  className="flex items-center gap-1.5 text-xs text-muted-foreground/80 hover:text-foreground transition-colors"
                >
                  <ExternalLink className="h-3 w-3" />
                  Manage all alerts
                </Link>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
