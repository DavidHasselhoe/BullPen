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
      // A quicker exit: with mode="wait" the two 200ms halves left an empty frame between steps.
      exit={{ opacity: 0, x: -20, transition: { duration: 0.12 } }}
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

/**
 * A stock's name over its ticker, for the pick list and the preview. The
 * second line drops the ticker when it would just repeat the name (some funds
 * have no other name in the catalogue).
 */
export function StockLabel({ name, ticker, detail }: { name: string; ticker: string; detail?: string }) {
  const showTicker = name.trim().toUpperCase() !== ticker.toUpperCase();
  return (
    <span style={{ flex: 1, minWidth: 0 }}>
      {/* clamp-ok: a company name in a one-line row; the full name is in the title */}
      <span title={name} style={{ display: 'block', fontSize: 15, fontWeight: 600, color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {name}
      </span>
      {(showTicker || detail) && (
        <span style={{ display: 'block', fontSize: 12, color: 'var(--fg-dim)' }}>
          {showTicker && <span className="mono">{ticker}</span>}
          {showTicker && detail && ' · '}
          {detail}
        </span>
      )}
    </span>
  );
}

/**
 * Step headline. `accent` is the optional serif word (DESIGN.md One Serif
 * Word Rule); only the payoff screens use it, since on every step it read as
 * a template and the word that mattered ("ready.") lost its weight.
 * Focused by GetStartedFlow after each step change, hence tabIndex -1.
 */
export function StepHeadline({ text, accent }: { text: string; accent?: string }) {
  return (
    <h1
      className="headline"
      tabIndex={-1}
      data-step-heading
      style={{ margin: '0 0 12px', fontSize: 'clamp(26px, 3.4vw, 34px)', color: 'var(--fg)', textAlign: 'center', outline: 'none' }}
    >
      {text}
      {accent && <>{' '}<span className="accent-serif" style={{ color: 'var(--accent)' }}>{accent}</span></>}
    </h1>
  );
}
