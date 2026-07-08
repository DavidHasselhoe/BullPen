'use client';

import { useState } from 'react';
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Link2, RefreshCw, Unlink, CheckCircle2, Clock, AlertCircle,
  Building2, ChevronDown, ChevronUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useBrokerageAccounts,
  useBrokerageConnect,
  useBrokerageSync,
  useBrokerageDisconnect,
  type BrokerageConnection,
} from '@/hooks/use-brokerage';
import { useEntitlements } from '@/hooks/use-entitlements';
import { UpgradeCTA } from '@/components/billing/UpgradeCTA';

// ─── Sub-components ───────────────────────────────────────────────────────────

function BrokerageIcon({ slug, name }: { slug?: string | null; name?: string | null }) {
  const initials = (name ?? slug ?? '??')
    .split(/[\s_-]/)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground shrink-0">
      {initials}
    </div>
  );
}

function AccountCard({
  account,
  onSync,
  onDisconnect,
  syncing,
}: {
  account: BrokerageConnection;
  onSync: () => void;
  onDisconnect: () => void;
  syncing: boolean;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  const lastSync = account.last_synced_at
    ? new Date(account.last_synced_at).toLocaleString('en-US', {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
      })
    : null;

  return (
    <>
      <div className="flex items-center gap-3 rounded-lg border border-border p-3">
        <BrokerageIcon slug={account.brokerage_slug} name={account.brokerage_name} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm truncate">
              {account.brokerage_name ?? account.brokerage_slug ?? 'Brokerage'}
            </span>
            {account.account_type && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                {account.account_type}
              </Badge>
            )}
            {account.is_active ? (
              <Badge className="text-[10px] px-1.5 py-0 h-4 bg-emerald-500/15 text-emerald-500 border-0">
                Active
              </Badge>
            ) : (
              <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4">
                Inactive
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
            {account.account_name && <span>{account.account_name}</span>}
            {account.account_number && <span>····{account.account_number.slice(-4)}</span>}
            {lastSync && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Synced {lastSync}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={onSync}
            disabled={syncing}
          >
            {syncing
              ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              : <RefreshCw className="h-3.5 w-3.5" />
            }
            <span className="ml-1 hidden sm:inline">{syncing ? 'Syncing…' : 'Sync'}</span>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-red-500 hover:text-red-500"
            onClick={() => setConfirmOpen(true)}
          >
            <Unlink className="h-3.5 w-3.5" />
            <span className="ml-1 hidden sm:inline">Disconnect</span>
          </Button>
        </div>
      </div>

      {/* Disconnect confirmation dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Disconnect {account.brokerage_name ?? 'brokerage'}?</DialogTitle>
            <DialogDescription>
              This removes the connection and stops syncing. Your existing imported holdings
              will remain in your portfolio — you can delete them manually if needed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => { setConfirmOpen(false); onDisconnect(); }}
            >
              Disconnect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function BrokerageConnect() {
  const { data, isLoading } = useBrokerageAccounts();
  const connectMutation    = useBrokerageConnect();
  const syncMutation       = useBrokerageSync();
  const disconnectMutation = useBrokerageDisconnect();
  const canConnectBrokerage = useEntitlements().can('brokerage');
  // Default open so the per-account Disconnect control is immediately visible.
  const [expanded, setExpanded] = useState(true);

  const activeAccounts = (data?.accounts ?? []).filter((a) => a.is_active);
  const hasConnections = activeAccounts.length > 0;

  // ── Loading skeleton ──────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-3 w-72 mt-1" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-10 w-40" />
        </CardContent>
      </Card>
    );
  }

  // ── Not configured (missing env vars) ────────────────────────────────────
  if (data && !data.configured && !data.registered) {
    return null; // Silently hide if admin hasn't configured SnapTrade keys
  }

  // ── Connected state ───────────────────────────────────────────────────────
  if (hasConnections) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Link2 className="h-4 w-4 text-emerald-500" />
                Connected Brokerages
              </CardTitle>
              <Badge className="bg-emerald-500/15 text-emerald-500 border-0 text-[11px]">
                {activeAccounts.length} account{activeAccounts.length === 1 ? '' : 's'}
              </Badge>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={() => syncMutation.mutate()}
                disabled={syncMutation.isPending}
              >
                {syncMutation.isPending
                  ? <><RefreshCw className="h-3.5 w-3.5 animate-spin mr-1.5" />Syncing…</>
                  : <><RefreshCw className="h-3.5 w-3.5 mr-1.5" />Sync All</>
                }
              </Button>
              {canConnectBrokerage ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => connectMutation.mutate()}
                  disabled={connectMutation.isPending}
                >
                  <Link2 className="h-3.5 w-3.5 mr-1.5" />
                  Add Account
                </Button>
              ) : (
                <UpgradeCTA label="Add Account (Pro)" size="sm" variant="outline" className="h-8 text-xs" />
              )}
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => setExpanded((e) => !e)}
              >
                {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          {syncMutation.isSuccess && (
            <div className="flex items-center gap-1.5 text-xs text-emerald-500 mt-1">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Synced {syncMutation.data?.synced ?? 0} position{(syncMutation.data?.synced ?? 0) === 1 ? '' : 's'}
            </div>
          )}
          {syncMutation.isError && (
            <div className="flex items-center gap-1.5 text-xs text-red-500 mt-1">
              <AlertCircle className="h-3.5 w-3.5" />
              {syncMutation.error instanceof Error ? syncMutation.error.message : 'Sync failed'}
            </div>
          )}
        </CardHeader>

        {expanded && (
          <CardContent className="pt-0 space-y-2">
            {activeAccounts.map((account) => (
              <AccountCard
                key={account.id}
                account={account}
                syncing={syncMutation.isPending}
                onSync={() => syncMutation.mutate()}
                onDisconnect={() =>
                  disconnectMutation.mutate(account.authorization_id ?? undefined)
                }
              />
            ))}
          </CardContent>
        )}
      </Card>
    );
  }

  // ── Not connected state ───────────────────────────────────────────────────
  return (
    <Card className={cn(
      'border-dashed transition-colors',
      connectMutation.isPending && 'opacity-75'
    )}>
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          Connect Your Brokerage
        </CardTitle>
        <CardDescription>
          Automatically import your positions from Robinhood, Schwab, Fidelity, IBKR, and 100+ other
          brokerages. Your holdings will stay in sync — no manual entry needed.
        </CardDescription>
      </CardHeader>

      <CardContent className="pt-0">
        <div className="flex items-center gap-3 flex-wrap">
          {canConnectBrokerage ? (
            <>
              <Button
                onClick={() => connectMutation.mutate()}
                disabled={connectMutation.isPending}
                className="gap-2"
              >
                {connectMutation.isPending
                  ? <><RefreshCw className="h-4 w-4 animate-spin" />Connecting…</>
                  : <><Link2 className="h-4 w-4" />Connect Brokerage</>
                }
              </Button>

              <span className="text-xs text-muted-foreground">
                Powered by SnapTrade · Read-only access
              </span>
            </>
          ) : (
            <>
              <UpgradeCTA label="Upgrade to Pro to connect" className="gap-2" />

              <span className="text-xs text-muted-foreground">
                Brokerage sync is a Pro feature
              </span>
            </>
          )}
        </div>

        {connectMutation.isError && (
          <div className="flex items-center gap-1.5 text-sm text-red-500 mt-3">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {connectMutation.error instanceof Error
              ? connectMutation.error.message
              : 'Failed to start connection. Please try again.'}
          </div>
        )}

        {connectMutation.isSuccess && (
          <p className="text-sm text-muted-foreground mt-3">
            The SnapTrade portal was opened in a new tab. Complete the connection there,
            then return here — your positions will sync automatically.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
