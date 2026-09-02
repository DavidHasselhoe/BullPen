'use client';

import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { startCheckout } from '@/lib/billing/checkout';
import { trackEvent } from '@/lib/analytics/track';
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
import { Toolkit } from './Toolkit';
import { FinalCTA } from './FinalCTA';
import { Footer } from './Footer';
import type { Shot } from '@/lib/landing/screenshots';
import './landing-styles.css';

export function LandingClient({ shots }: { shots: Shot[] }) {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  // Light is the default for now (David evaluating it live, 2026-09) — see
  // docs/landing-page-light-mode-research.md. ?theme=dark is the escape hatch
  // back to the old page for comparison during the trial. Root server-renders
  // light unconditionally (matches the new default exactly, zero
  // hydration-mismatch risk); the client-only override only ever swaps TO
  // dark, post-mount.
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const wantsDark = new URLSearchParams(window.location.search).get('theme') === 'dark';
    if (wantsDark) rootRef.current?.classList.replace('landing-light-preview', 'dark');
  }, []);
  const [authOpen, setAuthOpen] = useState(false);
  // Once true, the modal stays mounted so close animations and state survive.
  const [authMounted, setAuthMounted] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>('signup');
  const [redirectTo, setRedirectTo] = useState('/dashboard');

  const openSignUp = (location: string) => {
    trackEvent('landing_cta_clicked', { location, action: 'sign_up' });
    if (isAuthenticated) { router.push('/dashboard'); return; }
    router.push('/get-started');
  };
  const openSignIn = (location: string) => {
    trackEvent('landing_cta_clicked', { location, action: 'sign_in' });
    if (isAuthenticated) { router.push('/dashboard'); return; }
    setRedirectTo('/dashboard');
    setAuthMode('login');
    setAuthMounted(true);
    setAuthOpen(true);
  };
  // Pro CTA: already signed in → straight to Stripe checkout; otherwise sign up
  // first, then resume checkout on /upgrade with the chosen plan.
  const openSubscribe = async (cycle: 'monthly' | 'annual') => {
    trackEvent('landing_cta_clicked', { location: 'pricing', action: 'subscribe', cycle });
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
    // Light by default now (see rootRef effect above for the ?theme=dark
    // escape hatch). KNOWN GAP, not yet fixed: AuthModal and Nav's UserMenu
    // avatar both use the *global* shadcn theme tokens (driven by
    // <html class="dark">, which ThemeProvider still sets for guests
    // regardless of this page's own local tokens), not this page's — so the
    // sign-up modal and the signed-in avatar dropdown still render dark
    // against this now-light page. Flagged to David rather than silently
    // patched; fixing it properly means either overriding shadcn's tokens
    // locally on those portaled components or having this page temporarily
    // own <html>'s class while mounted, and deserves its own pass.
    <div ref={rootRef} className="bullpen-landing-root landing-light-preview">
      <div className="page-bg" aria-hidden />
      <div className="page-grid" aria-hidden />
      <div className="page-noise" aria-hidden />

      <div className="content-layer">
        <Nav onSignIn={() => openSignIn('nav')} onSignUp={() => openSignUp('nav')} />
        <Hero onSignUp={() => openSignUp('hero')} />
        <TickerStrip />
        <Features />
        <HowItWorks />
        <Peek shots={shots} />
        <Toolkit />
        <Pricing onSignUp={() => openSignUp('pricing')} onSubscribe={openSubscribe} />
        <FAQ />
        <FinalCTA onSignUp={() => openSignUp('final_cta')} />
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
