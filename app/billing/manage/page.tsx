'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { startPortal } from '@/lib/billing/checkout';
import { Button } from '@/components/ui/button';

/**
 * /billing/manage — the "Manage or cancel" link in every billing email.
 *
 * The emails used to carry a Stripe customer-portal session URL created at
 * send time. Stripe documents those as short-lived ("will expire if the
 * customer does not visit the URL"), so the cancel link in a trial email was
 * likely dead days later, when it matters. Visa's trial rule (Core Rules,
 * 18 April 2026) and California's auto-renewal law both require that link to
 * let the cardholder cancel online. This page is a stable address that signs
 * the user in if needed and opens a fresh portal session at click time.
 */
export default function ManageBillingPage() {
  const { t } = useTranslation('billing');
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();
  const [failed, setFailed] = useState<'no_subscription' | 'error' | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      router.replace(`/login?redirect=${encodeURIComponent('/billing/manage')}`);
      return;
    }
    if (started.current) return;
    started.current = true;
    void startPortal().then((result) => {
      if (result.url) window.location.assign(result.url);
      else setFailed(result.noSubscription ? 'no_subscription' : 'error');
    });
  }, [isAuthenticated, isLoading, router]);

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      {failed ? (
        <>
          <p className="text-sm text-muted-foreground" role="alert">
            {failed === 'no_subscription' ? t('manageBillingNoSubscription') : t('manageBillingFailed')}
          </p>
          <Button asChild variant="outline">
            <Link href={failed === 'no_subscription' ? '/upgrade' : '/dashboard'}>
              {failed === 'no_subscription' ? t('manageBillingSeePlans') : t('manageBillingBackToApp')}
            </Link>
          </Button>
        </>
      ) : (
        <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          {t('manageBillingOpening')}
        </p>
      )}
    </main>
  );
}
