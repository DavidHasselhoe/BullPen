'use client';

import type { InvestAnswer } from '@/lib/onboarding/pending-onboarding';
import { StepHeadline, StepShell } from './StepShell';

/**
 * "Do you invest already?" One tap moves on, like the explain-style screen.
 * Nothing is imported here: there is no account yet. The answer decides what
 * Home leads with afterwards (FirstWeekChecklist puts "Add what you own"
 * first for 'yes' and leaves it out for 'not_yet').
 */
export function InvestStep({
  value,
  onSelect,
  onBack,
  stepIndex,
  totalSteps,
}: {
  value?: InvestAnswer;
  onSelect: (answer: InvestAnswer) => void;
  onBack: () => void;
  stepIndex: number;
  totalSteps: number;
}) {
  const options: { answer: InvestAnswer; title: string; body: string }[] = [
    {
      answer: 'yes',
      title: 'Yes, I own stocks or funds',
      body: "After setup, add what you own by typing it in or importing a file from your broker. Home then follows your real portfolio.",
    },
    {
      answer: 'not_yet',
      title: 'Not yet',
      body: "Start with your watchlist and learn as you go. Add holdings whenever you're ready.",
    },
  ];

  return (
    <StepShell stepIndex={stepIndex} totalSteps={totalSteps} onBack={onBack}>
      <StepHeadline text="Do you invest already?" />
      <p style={{ margin: '0 0 28px', textAlign: 'center', fontSize: 15, color: 'var(--fg-muted)', textWrap: 'balance' }}>
        This decides what Home shows you first.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {options.map((opt) => {
          const selected = value === opt.answer;
          return (
            <button
              key={opt.answer}
              type="button"
              onClick={() => onSelect(opt.answer)}
              aria-pressed={selected}
              style={{
                display: 'flex', flexDirection: 'column', gap: 6, width: '100%', textAlign: 'left',
                padding: '16px 20px', borderRadius: 14, cursor: 'pointer', color: 'var(--fg)',
                border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
                background: selected ? 'var(--accent-soft)' : 'var(--surface)',
                transition: 'border-color 180ms cubic-bezier(0.22,1,0.36,1), background 180ms cubic-bezier(0.22,1,0.36,1)',
              }}
            >
              <span style={{ fontSize: 17, fontWeight: 600 }}>{opt.title}</span>
              <span style={{ fontSize: 13, color: 'var(--fg-dim)', lineHeight: 1.5 }}>{opt.body}</span>
            </button>
          );
        })}
      </div>
    </StepShell>
  );
}
