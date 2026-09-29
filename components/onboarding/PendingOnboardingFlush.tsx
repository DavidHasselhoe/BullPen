'use client';

import { useEffect } from 'react';
import { useAuth } from '@/components/auth/AuthProvider';
import { flushPendingOnboardingData } from '@/lib/onboarding/flush';
import { readPendingOnboarding } from '@/lib/onboarding/pending-onboarding';

/**
 * Silent fallback retry of the pre-signup quiz flush. AuthProvider already
 * does this on SIGNED_IN; this catches the rare case where that ran before
 * `user` settled into state, or failed outright. Harmless when the first
 * flush succeeded, since both are gated on the same "is there pending data"
 * check.
 *
 * It used to also float a "Build your portfolio" starter-ticker popup on the
 * dashboard. Home's own StarterPicker (components/dashboard) does that job now,
 * inline and onto the watchlist rather than as share-less holdings.
 */
export function PendingOnboardingFlush() {
  const { user, isLoading, refresh } = useAuth();

  useEffect(() => {
    if (isLoading || !user) return;
    if (!readPendingOnboarding()) return;
    void flushPendingOnboardingData(user.id).then(() => refresh());
  }, [isLoading, user, refresh]);

  return null;
}
