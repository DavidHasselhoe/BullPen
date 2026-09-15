'use client';

import { getGlossaryEntry } from '@/lib/finance/glossary';
import type { ExplainStyle } from '@/lib/onboarding/pending-onboarding';
import { StepHeadline, StepShell } from './StepShell';

/**
 * The one onboarding choice that visibly changes the app. Both cards render the
 * same metric the way the app renders it in each mode (TermTooltip: plain label
 * plus glossary description for beginners, the market term otherwise), read
 * from the glossary so it can't drift from the real UI. No example number is
 * shown: a figure that looks like data but belongs to no company would be a
 * synthetic number.
 */
export function ExplainStyleStep({
  value,
  onSelect,
  stepIndex,
  totalSteps,
}: {
  value?: ExplainStyle;
  onSelect: (style: ExplainStyle) => void;
  stepIndex: number;
  totalSteps: number;
}) {
  const pe = getGlossaryEntry('P/E');
  const options: { style: ExplainStyle; title: string; label: string; body: string }[] = [
    {
      style: 'plain',
      title: 'Plain English',
      label: pe?.plainLabel ?? 'Price vs Earnings',
      body: pe?.description ?? '',
    },
    {
      style: 'market',
      title: 'Market terms',
      label: 'P/E (TTM)',
      body: 'The standard terms you see on trading platforms, with explanations one tap away.',
    },
  ];

  return (
    <StepShell stepIndex={stepIndex} totalSteps={totalSteps}>
      <StepHeadline text="How should BullPen explain" accent="things?" />
      <p style={{ margin: '0 0 28px', textAlign: 'center', fontSize: 15, color: 'var(--fg-muted)' }}>
        Here is the same metric, shown both ways. Pick the one that reads right.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {options.map((opt) => {
          const selected = value === opt.style;
          return (
            <button
              key={opt.style}
              type="button"
              onClick={() => onSelect(opt.style)}
              aria-pressed={selected}
              style={{
                display: 'flex', flexDirection: 'column', gap: 6, width: '100%', textAlign: 'left',
                padding: '16px 20px', borderRadius: 14, cursor: 'pointer', color: 'var(--fg)',
                border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
                background: selected ? 'var(--accent-soft)' : 'var(--surface)',
                transition: 'border-color 180ms cubic-bezier(0.22,1,0.36,1), background 180ms cubic-bezier(0.22,1,0.36,1)',
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--fg-dim)' }}>{opt.title}</span>
              <span style={{ fontSize: 17, fontWeight: 600 }}>{opt.label}</span>
              <span style={{ fontSize: 13, color: 'var(--fg-dim)', lineHeight: 1.5 }}>{opt.body}</span>
            </button>
          );
        })}
      </div>
      <p style={{ marginTop: 16, fontSize: 12, color: 'var(--fg-dim)', textAlign: 'center' }}>
        You can change this anytime in Settings.
      </p>
    </StepShell>
  );
}
