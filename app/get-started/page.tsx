'use client';

import Link from 'next/link';
import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { Logo } from '@/components/landing/Atoms';
import { GetStartedFlow } from '@/components/get-started/GetStartedFlow';
import '@/components/landing/landing-styles.css';

function GetStartedContent() {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  // Set by /auth/callback for a brand-new account that signed up some other
  // way: it runs the same steps, saving to the account instead of staging
  // for a signup that already happened.
  const setup = useSearchParams().get('setup') === '1';
  const leave = isAuthenticated && !setup;

  useEffect(() => {
    if (!isLoading && leave) {
      // Every signed-in way out of onboarding lands on the trial offer: the
      // form's own success, the wait screen noticing the email was confirmed,
      // or a signed-in visitor. The trial page sends Pro members on to the
      // dashboard. Deciding by "are choices still staged" raced the flush,
      // which clears them at sign-in and sent people to the dashboard instead.
      router.replace('/get-started/trial');
    }
  }, [isLoading, leave, router]);

  // The frame renders while auth loads, so the page is never a blank screen.
  const ready = !isLoading && !leave;

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
            {ready && (isAuthenticated ? (
              // Signed in means the account exists already (see /auth/callback),
              // so setup is optional. The stock page banner still asks the one
              // question that matters if they skip.
              <Link href="/dashboard" style={{ fontSize: 13, color: 'var(--fg-dim)' }}>
                Skip for now
              </Link>
            ) : (
              <Link
                href="/login"
                style={{ fontSize: 13, color: 'var(--fg-dim)' }}
              >
                Already have an account? <span style={{ color: 'var(--fg)', fontWeight: 600 }}>Sign in</span>
              </Link>
            ))}
          </div>
        </header>

        {ready && <GetStartedFlow signedIn={isAuthenticated} />}
      </div>
    </div>
  );
}

export default function GetStartedPage() {
  return (
    <Suspense fallback={null}>
      <GetStartedContent />
    </Suspense>
  );
}
