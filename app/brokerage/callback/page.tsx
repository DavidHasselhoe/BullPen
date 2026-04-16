'use client';

// SnapTrade OAuth callback page.
// SnapTrade redirects here after the user connects (or cancels) a brokerage.
// We auto-trigger a sync, show status, then redirect back to /holdings.

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle2, XCircle, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

type Status = 'syncing' | 'success' | 'error' | 'cancelled';

// Inner component uses useSearchParams — must be inside <Suspense>
function BrokerageCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<Status>('syncing');
  const [message, setMessage] = useState('Syncing your positions…');
  const [syncedCount, setSyncedCount] = useState<number | null>(null);

  useEffect(() => {
    // SnapTrade may pass an error param if the user cancelled
    const error = searchParams.get('error');
    if (error) {
      setStatus('cancelled');
      setMessage('Connection was cancelled. You can try again from your holdings page.');
      return;
    }

    // Auto-sync positions from the newly connected account
    async function syncPositions() {
      try {
        const res = await fetch('/api/brokerage/sync', { method: 'POST' });
        const json = await res.json();

        if (!res.ok || !json.success) {
          throw new Error(json.error ?? 'Sync failed');
        }

        setSyncedCount(json.synced ?? 0);
        setStatus('success');
        setMessage(
          json.synced > 0
            ? `Successfully imported ${json.synced} position${json.synced === 1 ? '' : 's'} from ${json.accounts} account${json.accounts === 1 ? '' : 's'}.`
            : 'Brokerage connected. No equity positions were found in your account.'
        );

        // Redirect to holdings after 3 s
        setTimeout(() => router.push('/holdings'), 3000);
      } catch (err) {
        setStatus('error');
        setMessage(err instanceof Error ? err.message : 'Something went wrong during sync.');
      }
    }

    syncPositions();
  }, [searchParams, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-md w-full space-y-6 text-center">
        {/* Icon */}
        <div className="flex justify-center">
          {status === 'syncing' && (
            <Loader2 className="h-16 w-16 text-muted-foreground animate-spin" />
          )}
          {status === 'success' && (
            <CheckCircle2 className="h-16 w-16 text-emerald-500" />
          )}
          {(status === 'error' || status === 'cancelled') && (
            <XCircle className="h-16 w-16 text-red-500" />
          )}
        </div>

        {/* Heading */}
        <div>
          <h1 className="text-2xl font-bold">
            {status === 'syncing'  && 'Connecting brokerage…'}
            {status === 'success'  && 'Brokerage connected!'}
            {status === 'error'    && 'Something went wrong'}
            {status === 'cancelled' && 'Connection cancelled'}
          </h1>
          <p className="mt-2 text-muted-foreground text-sm">{message}</p>
        </div>

        {/* Sync count badge */}
        {status === 'success' && syncedCount != null && syncedCount > 0 && (
          <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-sm font-medium text-emerald-500">
            <RefreshCw className="h-3.5 w-3.5" />
            {syncedCount} position{syncedCount === 1 ? '' : 's'} imported
          </div>
        )}

        {/* Redirect notice or action buttons */}
        {status === 'success' && (
          <p className="text-xs text-muted-foreground">
            Redirecting you to My Holdings in a moment…
          </p>
        )}

        {(status === 'error' || status === 'cancelled') && (
          <div className="flex gap-3 justify-center">
            <Button variant="outline" onClick={() => router.push('/holdings')}>
              Go to Holdings
            </Button>
            {status === 'error' && (
              <Button onClick={() => {
                setStatus('syncing');
                setMessage('Retrying sync…');
                fetch('/api/brokerage/sync', { method: 'POST' })
                  .then((r) => r.json())
                  .then((json) => {
                    if (json.success) {
                      setSyncedCount(json.synced ?? 0);
                      setStatus('success');
                      setMessage(`Imported ${json.synced} position${json.synced === 1 ? '' : 's'}.`);
                      setTimeout(() => router.push('/holdings'), 2500);
                    } else {
                      setStatus('error');
                      setMessage(json.error ?? 'Retry failed');
                    }
                  })
                  .catch(() => {
                    setStatus('error');
                    setMessage('Network error — please try again.');
                  });
              }}>
                Retry Sync
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Page export — wraps the content in Suspense so useSearchParams() is safe
export default function BrokerageCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <BrokerageCallbackContent />
    </Suspense>
  );
}
