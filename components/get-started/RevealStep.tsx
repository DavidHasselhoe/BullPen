'use client';

import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { describeAnswer, QUIZ_QUESTIONS } from './quiz-questions';
import { GetStartedSignupForm } from './GetStartedSignupForm';
import { OnboardingProgress } from './OnboardingProgress';
import { buildRevealSummary } from '@/lib/onboarding/reveal-copy';
import type { CompleteQuizAnswers } from '@/lib/onboarding/pending-onboarding';

interface RevealStepProps {
  answers: CompleteQuizAnswers;
  onBack: () => void;
  stepIndex: number;
  totalSteps: number;
}

export function RevealStep({ answers, onBack, stepIndex, totalSteps }: RevealStepProps) {
  const summary = buildRevealSummary(answers);

  const chips = QUIZ_QUESTIONS.map((q) => ({
    key: q.key,
    label: describeAnswer(q.key, answers[q.key]),
  }));

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.2 }}
      style={{ maxWidth: 560, margin: '0 auto', width: '100%' }}
    >
      <OnboardingProgress stepIndex={stepIndex} totalSteps={totalSteps} />

      <button
        type="button"
        onClick={onBack}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          marginBottom: 20,
          fontSize: 13,
          color: 'var(--fg-dim)',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: 0,
        }}
      >
        <ArrowLeft size={14} />
        Back
      </button>

      <h1
        className="headline"
        style={{ margin: '0 0 20px', fontSize: 'clamp(32px, 4.4vw, 48px)', color: 'var(--fg)', textAlign: 'center' }}
      >
        Your BullPen,{' '}
        <span className="accent-serif" style={{ color: 'var(--accent)' }}>
          tailored.
        </span>
      </h1>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: 24 }}>
        {chips.map((chip) => (
          <span
            key={chip.key}
            className="mono"
            style={{
              padding: '6px 14px',
              borderRadius: 999,
              background: 'var(--accent-soft)',
              color: 'var(--accent)',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {chip.label}
          </span>
        ))}
      </div>

      <p
        style={{
          margin: '0 auto',
          fontSize: 16,
          lineHeight: 1.6,
          color: 'var(--fg-muted)',
          textAlign: 'center',
          textWrap: 'pretty',
        }}
      >
        {summary.paragraph}
      </p>
      <p
        style={{
          margin: '14px auto 0',
          fontSize: 14,
          fontWeight: 600,
          color: 'var(--accent)',
          textAlign: 'center',
        }}
      >
        {summary.closing}
      </p>

      <GetStartedSignupForm />
    </motion.div>
  );
}
