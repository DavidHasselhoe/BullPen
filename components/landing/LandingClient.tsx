'use client';

import { lazy, Suspense, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { startCheckout } from '@/lib/billing/checkout';
import type { AuthMode } from '@/components/auth/AuthModal';

// Auth forms (Supabase client, validation) only download when a CTA is clicked —
// keeps them out of the landing page's initial bundle.
const AuthModal = lazy(() => import('@/components/auth/AuthModal').then((m) => ({ default: m.AuthModal })));
import { Nav } from './Nav';
import { Hero } from './Hero';
import { TickerStrip } from './TickerStrip';
import { Features } from './Features';
import { HowItWorks } from './HowItWorks';
import { Peek } from './Peek';
import { Pricing } from './Pricing';
import { FAQ } from './FAQ';
import { Testimonials } from './Testimonials';
import { FinalCTA } from './FinalCTA';
import { Footer } from './Footer';
import './landing-styles.css';

export function LandingClient() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);
  // Once true, the modal stays mounted so close animations and state survive.
  const [authMounted, setAuthMounted] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>('signup');
  const [redirectTo, setRedirectTo] = useState('/dashboard');

  const openSignUp = () => {
    if (isAuthenticated) { router.push('/dashboard'); return; }
    router.push('/get-started');
  };
  const openSignIn = () => {
    if (isAuthenticated) { router.push('/dashboard'); return; }
    setRedirectTo('/dashboard');
    setAuthMode('login');
    setAuthMounted(true);
    setAuthOpen(true);
  };
  // Pro CTA: already signed in → straight to Stripe checkout; otherwise sign up
  // first, then resume checkout on /upgrade with the chosen plan.
  const openSubscribe = async (cycle: 'monthly' | 'annual') => {
    if (isAuthenticated) {
      const result = await startCheckout(cycle);
      if (result.url) { window.location.href = result.url; return; }
      // Already Pro, or Stripe not ready — let /upgrade handle the messaging.
      router.push(`/upgrade?checkout=${cycle}`);
      return;
    }
    setRedirectTo(`/upgrade?checkout=${cycle}`);
    setAuthMode('signup');
    setAuthMounted(true);
    setAuthOpen(true);
  };

  return (
    // `dark` re-asserts shadcn's dark-mode tokens locally: the landing page is dark-only by
    // design, but ThemeProvider strips `.dark` off <html> for any signed-in user whose saved
    // app theme is 'light', which otherwise made shadcn-themed pieces here (e.g. the account
    // avatar in Nav's UserMenu) render in near-black light-mode colors — invisible against
    // this page's independently dark background until a hover state happened to add contrast.
    <div className="bullpen-landing-root dark">
      <div className="page-bg" aria-hidden />
      <div className="page-grid" aria-hidden />
      <div className="page-noise" aria-hidden />

      <div className="content-layer">
        <Nav onSignIn={openSignIn} onSignUp={openSignUp} />
        <Hero onSignUp={openSignUp} />
        <TickerStrip />
        <Features />
        <HowItWorks />
        <Peek />
        <Testimonials />
        <Pricing onSignUp={openSignUp} onSubscribe={openSubscribe} />
        <FAQ />
        <FinalCTA onSignUp={openSignUp} />
        <Footer />
      </div>

      {authMounted && (
        <Suspense fallback={null}>
          <AuthModal open={authOpen} onOpenChange={setAuthOpen} initialMode={authMode} redirectTo={redirectTo} />
        </Suspense>
      )}
    </div>
  );
}
