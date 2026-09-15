'use client';

import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { OnboardingProgress } from './OnboardingProgress';

/** Motion, progress bar and back button shared by every onboarding screen. */
export function StepShell({
  stepIndex,
  totalSteps,
  onBack,
  maxWidth = 520,
  children,
}: {
  stepIndex: number;
  totalSteps: number;
  onBack?: () => void;
  maxWidth?: number;
  children: ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.2 }}
      style={{ maxWidth, margin: '0 auto', width: '100%' }}
    >
      {/* Back lives on the progress row, like a native flow's nav bar: same
          spot on every screen, and it never pushes the headline down. The
          empty third column keeps the bar centred whether or not it shows. */}
      <div style={{ display: 'grid', gridTemplateColumns: '44px 1fr 44px', alignItems: 'center', gap: 12, marginBottom: 32 }}>
        {onBack ? (
          <button type="button" onClick={onBack} aria-label="Back" className="onboarding-back">
            <ArrowLeft size={18} aria-hidden />
          </button>
        ) : (
          <span aria-hidden />
        )}
        <OnboardingProgress stepIndex={stepIndex} totalSteps={totalSteps} />
        <span aria-hidden />
      </div>
      {children}
    </motion.div>
  );
}

/** Headline with the single serif accent word (DESIGN.md One Serif Word Rule). */
export function StepHeadline({ text, accent }: { text: string; accent: string }) {
  return (
    <h1
      className="headline"
      style={{ margin: '0 0 12px', fontSize: 'clamp(26px, 3.4vw, 34px)', color: 'var(--fg)', textAlign: 'center' }}
    >
      {text}{' '}
      <span className="accent-serif" style={{ color: 'var(--accent)' }}>{accent}</span>
    </h1>
  );
}
