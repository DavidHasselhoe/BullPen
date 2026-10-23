'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { PLAN_COMPARISON } from '@/lib/billing/entitlements';
import { planCopyKey } from '@/lib/billing/plan-copy';
import { fmtClockDate } from '@/lib/dates/clock';
import { trackEvent } from '@/lib/analytics/track';

interface SubscriptionState {
  cancelAt: number | null;
  justCancelled?: boolean;
  trialing?: boolean;
}

/** What Free loses: the AI analyst rows, since that is what Pro is mostly for. */
const AI_ROWS = (PLAN_COMPARISON.find((g) => g.title === 'AI analyst')?.rows ?? []).filter((r) => r.free !== r.pro);

/**
 * Shown when the Stripe portal returns (?billing=portal) right after a
 * cancellation: confirms no charge is coming and when Pro ends, then shows
 * what changes on Free. One way back, no guilt: the decision is theirs.
 * The written record is the cancellation email the webhook sends.
 */
function CancelledModalInner() {
  const { t } = useTranslation('billing');
  const params = useSearchParams();
  const router = useRouter();
  const fromPortal = params.get('billing') === 'portal';
  const [dismissed, setDismissed] = useState(false);

  const { data } = useQuery<SubscriptionState>({
    queryKey: ['billing-subscription', fromPortal],
    queryFn: async () => {
      const res = await fetch('/api/billing/subscription');
      if (!res.ok) return { cancelAt: null };
      return res.json();
    },
    enabled: fromPortal,
    staleTime: 0,
  });

  const fresh = Boolean(data?.cancelAt && data.justCancelled);
  const open = fresh && !dismissed;

  useEffect(() => {
    if (fresh) trackEvent('cancel_confirmation_viewed', { trialing: Boolean(data?.trialing) });
  }, [fresh, data?.trialing]);

  if (!data?.cancelAt) return null;
  const date = fmtClockDate(new Date(data.cancelAt * 1000), { month: 'long', day: 'numeric' });

  const close = () => {
    setDismissed(true);
    router.replace('/dashboard', { scroll: false });
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) close(); }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('cancelledTitle')}</DialogTitle>
          <DialogDescription>
            {t(data.trialing ? 'cancelledTrialBody' : 'cancelledPaidBody', { date })}
          </DialogDescription>
        </DialogHeader>

        <div>
          <p className="text-xs font-medium text-muted-foreground">{t('cancelledWhatChanges', { date })}</p>
          <ul className="mt-2 divide-y divide-border rounded-lg border">
            {AI_ROWS.map((row) => (
              <li key={row.label} className="flex items-baseline justify-between gap-4 px-3 py-2 text-sm">
                <span className="text-foreground">{t(planCopyKey('row', row.label), { defaultValue: row.label })}</span>
                <span className="shrink-0 text-right text-muted-foreground">
                  {typeof row.free === 'string'
                    ? t(planCopyKey('value', row.free), { defaultValue: row.free })
                    : t('cancelledNotOnFree')}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-muted-foreground">{t('cancelledResumeHint', { date })}</p>
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button asChild variant="outline" className="min-h-11 sm:min-h-9">
            <Link href="/billing/manage" onClick={() => trackEvent('cancel_keep_pro_clicked', { trialing: Boolean(data.trialing) })}>
              {t('cancelledKeepPro')}
            </Link>
          </Button>
          <Button onClick={close} className="min-h-11 sm:min-h-9">{t('cancelledDone')}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function CancelledModal() {
  return (
    <Suspense fallback={null}>
      <CancelledModalInner />
    </Suspense>
  );
}
