'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { UpgradeSuccessModal } from './UpgradeSuccessModal';
import { trackEvent } from '@/lib/analytics/track';

/** Opens the existing success modal when Stripe Checkout returns from onboarding (?trial=started). */
function TrialStartedModalInner() {
  const params = useSearchParams();
  const router = useRouter();
  const started = params.get('trial') === 'started';
  const [open, setOpen] = useState(started);

  useEffect(() => {
    if (started) trackEvent('trial_checkout_completed', {});
  }, [started]);

  return (
    <UpgradeSuccessModal
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // Drop the query param so a refresh doesn't reopen it.
        if (!next) router.replace('/dashboard', { scroll: false });
      }}
    />
  );
}

export function TrialStartedModal() {
  return (
    <Suspense fallback={null}>
      <TrialStartedModalInner />
    </Suspense>
  );
}
