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
      <OnboardingProgress stepIndex={stepIndex} totalSteps={totalSteps} />
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 20, fontSize: 13,
            color: 'var(--fg-dim)', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
          }}
        >
          <ArrowLeft size={14} />
          Back
        </button>
      )}
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
