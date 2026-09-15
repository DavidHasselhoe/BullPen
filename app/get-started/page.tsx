'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { Logo } from '@/components/landing/Atoms';
import { GetStartedFlow } from '@/components/get-started/GetStartedFlow';
import { hasPendingOnboarding } from '@/lib/onboarding/pending-onboarding';
import '@/components/landing/landing-styles.css';

export default function GetStartedPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      // Just finished onboarding (choices still staged): the trial offer is
      // the next screen. Anyone else signed in has nothing to do here.
      router.replace(hasPendingOnboarding() ? '/get-started/trial' : '/dashboard');
    }
  }, [isLoading, isAuthenticated, router]);

  if (isLoading || isAuthenticated) return null;

  return (
    <div className="bullpen-landing-root dark">
      <div className="page-bg" aria-hidden />
      <div className="page-noise" aria-hidden />

      <div className="content-layer">
        <header style={{ borderBottom: '1px solid var(--border)', padding: '24px 0' }}>
          <div className="wrap" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Link href="/" aria-label="BullPen home">
              <Logo size="sm" />
            </Link>
            <Link
              href="/login"
              style={{ fontSize: 13, color: 'var(--fg-dim)' }}
            >
              Already have an account? <span style={{ color: 'var(--fg)', fontWeight: 600 }}>Sign in</span>
            </Link>
          </div>
        </header>

        <GetStartedFlow />
      </div>
    </div>
  );
}
