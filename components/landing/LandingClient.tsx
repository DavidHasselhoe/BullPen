'use client';

import { useState } from 'react';
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
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>('signup');

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
      <div className="page-noise" aria-hidden />

      <div className="content-layer">
        <Nav onSignIn={openSignIn} onSignUp={openSignUp} />
        <Hero onSignUp={openSignUp} />
        <TickerStrip />
        <Features />
        <HowItWorks />
        <Peek />
        <Testimonials />
        <Pricing onSignUp={openSignUp} />
        <FAQ />
        <FinalCTA onSignUp={openSignUp} />
        <Footer />
      </div>

      <AuthModal open={authOpen} onOpenChange={setAuthOpen} initialMode={authMode} redirectTo="/dashboard" />
    </div>
  );
}
