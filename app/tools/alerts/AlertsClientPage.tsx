'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { Bell, Plus, AlertCircle } from 'lucide-react';
import { ToolPage, ToolHeader, ToolSectionTitle } from '@/components/tools/ToolHeader';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAuth } from '@/hooks/use-auth';
import { humanizeError } from '@/lib/errors/humanize';
import { cn } from '@/lib/utils';
import { CreateAlertForm } from '@/components/alerts/CreateAlertForm';
import { AlertList } from '@/components/alerts/AlertList';
import { AuthGate } from '@/components/ui/AuthGate';
import { FREE_ACTIVE_ALERT_LIMIT, type AlertType } from '@/types/alerts';
import { useAlerts } from '@/hooks/use-alerts';

export default function AlertsClientPage() {
  const { t } = useTranslation('tools');
  const searchParams = useSearchParams();
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  // When arriving from the command palette (?symbol=NVDA&name=NVIDIA+Corporation),
  // open the composer immediately. useState initializer runs once so this is safe.
  const prefilledSymbol = searchParams.get('symbol')?.toUpperCase() ?? null;
  const prefilledName = searchParams.get('name') ?? prefilledSymbol ?? null;
  const [composerOpen, setComposerOpen] = useState(() => !!prefilledSymbol);
  // Which stock the composer's ticker field is locked to — either from the URL
  // (command palette flow) or from clicking "Add condition" on an existing group.
  const [lockedTicker, setLockedTicker] = useState<{ ticker: string; name: string } | null>(
    prefilledSymbol && prefilledName ? { ticker: prefilledSymbol, name: prefilledName } : null
  );
  const composerRef = useRef<HTMLDivElement>(null);

  const openComposerFor = (symbol: string, companyName: string | null) => {
    setLockedTicker({ ticker: symbol, name: companyName ?? symbol });
    setComposerOpen(true);
  };

  // Scroll the composer into view when it's opened to add a condition to a
  // stock further down the list — otherwise it appears off-screen above the fold.
  useEffect(() => {
    if (composerOpen && lockedTicker) {
      composerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [composerOpen, lockedTicker]);

  // Optional pre-fill from the chart's alert tool (?price=200&type=price_above).
  const rawType = searchParams.get('type');
  const initialAlertType: AlertType | undefined =
    rawType === 'price_above' || rawType === 'price_below' ? rawType : undefined;
  const rawPrice = parseFloat(searchParams.get('price') ?? '');
  const initialThreshold = Number.isFinite(rawPrice) && rawPrice > 0 ? rawPrice : undefined;

  const { alerts, activeSymbolCount, isLoading, isError, error, refetch, create, toggle, remove } = useAlerts();

  // ── Auth gate ──────────────────────────────────────────────────────────────
  if (!authLoading && !isAuthenticated) {
    // The shared gate: both buttons, and ?redirect (this page sent ?redirectTo,
    // which /login doesn't read, so signing in landed on Home). The query is
    // kept so a "set an alert at $X" link still arrives prefilled.
    const query = searchParams.toString();
    return (
      <AuthGate
        icon={<Bell className="h-7 w-7" />}
        title={t('alertsSignInTitle', 'Sign in to set alerts')}
        description={t('alertsSignInDescription', 'Create personal alerts when a stock hits a price, % move, or all-time high.')}
        returnTo={`/tools/alerts${query ? `?${query}` : ''}`}
      />
    );
  }

  return (
    <ToolPage>
      <ToolHeader
        icon={<Bell />}
        title={t('alertsTitle', 'Price Alerts')}
        description={t('alertsSubtitle', 'Get notified when a stock hits a target price, daily move, 52-week extreme, or new high.')}
        actions={
          <div className="flex flex-col items-end gap-2">
            {!composerOpen && (
              <Button
                size="sm"
                onClick={() => { setLockedTicker(null); setComposerOpen(true); }}
                className="gap-1.5"
              >
                <Plus className="h-3.5 w-3.5" />
                {t('alertsNewAlert', 'New alert')}
              </Button>
            )}
            {!isLoading && (
              <div className="hidden items-center gap-1.5 whitespace-nowrap sm:flex">
                <div className="h-1 w-14 overflow-hidden rounded-full bg-muted/60">
                  <div
                    className={cn(
                      'h-full rounded-full transition-[width] duration-300',
                      activeSymbolCount >= FREE_ACTIVE_ALERT_LIMIT ? 'bg-amber-400' : 'bg-primary/70'
                    )}
                    style={{ width: `${Math.min(100, (activeSymbolCount / FREE_ACTIVE_ALERT_LIMIT) * 100)}%` }}
                  />
                </div>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {activeSymbolCount}/{FREE_ACTIVE_ALERT_LIMIT}
                </span>
              </div>
            )}
          </div>
        }
      />

      <div className="space-y-8">

        {/* Composer */}
        {composerOpen && (
          <div ref={composerRef}>
            <CreateAlertForm
              key={lockedTicker?.ticker ?? 'blank'}
              onCreated={() => setComposerOpen(false)}
              onCancel={() => setComposerOpen(false)}
              onCreate={create}
              initialTicker={lockedTicker ?? undefined}
              initialAlertType={initialAlertType}
              initialThreshold={initialThreshold}
            />
          </div>
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
            <AlertCircle className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{humanizeError(error)}</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>{t('tryAgainButton', 'Try again')}</Button>
          </div>
        ) : alerts.length === 0 ? (
          // Empty state
          <div className="rounded-2xl border border-border/30 border-dashed py-12 px-6">
            <EmptyState
              pose="alert"
              imageSize={168}
              title={t('alertsEmptyTitle', 'No alerts yet')}
              description={t('alertsEmptyDescription', "Pick a stock and set your first threshold. We'll ping you the moment it triggers.")}
            >
              {!composerOpen && (
                <div className="flex justify-center">
                  <Button
                    size="sm"
                    onClick={() => setComposerOpen(true)}
                    className="gap-1.5"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {t('alertsCreateFirst', 'Create your first alert')}
                  </Button>
                </div>
              )}
            </EmptyState>
          </div>
        ) : (
          <AlertList alerts={alerts} onToggle={toggle} onDelete={remove} onAddCondition={openComposerFor} />
        )}

        {/* About */}
        <div className="border-t border-border/40 pt-5">
          <ToolSectionTitle className="mb-1.5">
            {t('alertsAboutHeading', 'About alerts')}
          </ToolSectionTitle>
          <p className="max-w-prose text-xs leading-relaxed text-muted-foreground">
            {t(
              'alertsAboutBody',
              "Alerts are checked at {{marketOpen}} and once every hour through close (Mon–Fri). Each alert can fire at most {{oncePerDay}} so you're never spammed. Pause one to silence it without losing the configuration.",
              { marketOpen: 'market open', oncePerDay: 'once per 24 hours' }
            )}
          </p>
        </div>
      </div>
    </ToolPage>
  );
}
