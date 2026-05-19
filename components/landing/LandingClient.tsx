'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AuthModal, type AuthMode } from '@/components/auth/AuthModal';
import { useAuth } from '@/hooks/use-auth';
import { Nav } from './Nav';
import { Hero } from './Hero';
import { TickerStrip } from './TickerStrip';
import { Features } from './Features';
import { HowItWorks } from './HowItWorks';
import { Peek } from './Peek';
import { Pricing } from './Pricing';
import { FAQ } from './FAQ';
import { FinalCTA } from './FinalCTA';
import { Footer } from './Footer';
import './landing-styles.css';

/**
 * Top-level marketing landing page (rendered at `/`).
 *
 * Owns the auth modal state — every "Sign up" / "Sign in" CTA lifts up to here.
 * Logged-in users are auto-redirected to /dashboard so they don't see the
 * marketing page when they're already a customer.
 */
export function LandingClient() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>('signup');

  // Signed-in users bypass the marketing page
  useEffect(() => {
    if (!isLoading && user) router.replace('/dashboard');
  }, [user, isLoading, router]);

  const openSignUp = () => {
    setAuthMode('signup');
    setAuthOpen(true);
  };
  const openSignIn = () => {
    setAuthMode('login');
    setAuthOpen(true);
  };

  return (
    <div className="bullpen-landing-root">
      <div className="page-bg" aria-hidden />
      <div className="page-grid" aria-hidden />

      <div className="content-layer">
        <Nav onSignIn={openSignIn} onSignUp={openSignUp} />
        <Hero onSignUp={openSignUp} />
        <TickerStrip />
        <Features />
        <HowItWorks />
        <Peek />
        <Pricing onSignUp={openSignUp} />
        <FAQ />
        <FinalCTA onSignUp={openSignUp} />
        <Footer />
      </div>

      <AuthModal open={authOpen} onOpenChange={setAuthOpen} initialMode={authMode} redirectTo="/dashboard" />
    </div>
  );
}
