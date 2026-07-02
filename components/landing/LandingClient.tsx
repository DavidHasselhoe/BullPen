'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { startCheckout } from '@/lib/billing/checkout';
import { AuthModal, type AuthMode } from '@/components/auth/AuthModal';
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
  const [authMode, setAuthMode] = useState<AuthMode>('signup');
  const [redirectTo, setRedirectTo] = useState('/dashboard');

  const openSignUp = () => {
    if (isAuthenticated) { router.push('/dashboard'); return; }
    setRedirectTo('/dashboard');
    setAuthMode('signup');
    setAuthOpen(true);
  };
  const openSignIn = () => {
    if (isAuthenticated) { router.push('/dashboard'); return; }
    setRedirectTo('/dashboard');
    setAuthMode('login');
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
    setAuthOpen(true);
  };

  return (
    <div className="bullpen-landing-root">
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

      <AuthModal open={authOpen} onOpenChange={setAuthOpen} initialMode={authMode} redirectTo={redirectTo} />
    </div>
  );
}
