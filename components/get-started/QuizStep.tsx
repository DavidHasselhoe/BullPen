'use client';

import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { OnboardingProgress } from './OnboardingProgress';
import type { QuizOption, QuizQuestion } from './quiz-questions';

interface QuizStepProps<K extends string, V extends string> {
  question: QuizQuestion<K, V>;
  selectedValue?: V;
  onSelect: (value: V) => void;
  onBack?: () => void;
  stepIndex: number;
  totalSteps: number;
}

export function QuizStep<K extends string, V extends string>({
  question,
  selectedValue,
  onSelect,
  onBack,
  stepIndex,
  totalSteps,
}: QuizStepProps<K, V>) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.2 }}
      style={{ maxWidth: 520, margin: '0 auto', width: '100%' }}
    >
      <OnboardingProgress stepIndex={stepIndex} totalSteps={totalSteps} />

      {onBack && (
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
      )}

      <h1
        className="headline"
        style={{ margin: '0 0 32px', fontSize: 'clamp(26px, 3.4vw, 34px)', color: 'var(--fg)', textAlign: 'center' }}
      >
        {question.headline}{' '}
        <span className="accent-serif" style={{ color: 'var(--accent)' }}>
          {question.accentWord}
        </span>
      </h1>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {question.options.map((opt) => (
          <QuizOptionButton
            key={opt.value}
            option={opt}
            isSelected={selectedValue === opt.value}
            onClick={() => onSelect(opt.value)}
          />
        ))}
      </div>
    </motion.div>
  );
}

function QuizOptionButton<V extends string>({
  option,
  isSelected,
  onClick,
}: {
  option: QuizOption<V>;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isSelected}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        width: '100%',
        textAlign: 'left',
        padding: '16px 20px',
        borderRadius: 14,
        border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
        background: isSelected ? 'var(--accent-soft)' : 'var(--surface)',
        color: 'var(--fg)',
        cursor: 'pointer',
        transition: 'all 180ms cubic-bezier(0.22,1,0.36,1)',
      }}
      onMouseEnter={(e) => {
        if (!isSelected) e.currentTarget.style.borderColor = 'var(--border-strong)';
      }}
      onMouseLeave={(e) => {
        if (!isSelected) e.currentTarget.style.borderColor = 'var(--border)';
      }}
    >
      <span style={{ fontSize: 15, fontWeight: 600 }}>{option.label}</span>
      {option.description && (
        <span style={{ fontSize: 13, color: 'var(--fg-dim)' }}>{option.description}</span>
      )}
    </button>
  );
}
