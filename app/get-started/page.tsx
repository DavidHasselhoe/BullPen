'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { Logo } from '@/components/landing/Atoms';
import { GetStartedFlow } from '@/components/get-started/GetStartedFlow';
import '@/components/landing/landing-styles.css';

export default function GetStartedPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      // Every signed-in way out of onboarding lands on the trial offer: the
      // form's own success, the wait screen noticing the email was confirmed,
      // or a signed-in visitor. The trial page sends Pro members on to the
      // dashboard. Deciding by "are choices still staged" raced the flush,
      // which clears them at sign-in and sent people to the dashboard instead.
      router.replace('/get-started/trial');
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
