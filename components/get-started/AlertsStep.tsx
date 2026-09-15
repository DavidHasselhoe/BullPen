'use client';

import type { AlertChoices } from '@/lib/onboarding/pending-onboarding';
import { StepHeadline, StepShell } from './StepShell';

const ROWS: { key: keyof AlertChoices; label: string; description: string }[] = [
  { key: 'price_alerts', label: 'Big price moves', description: 'When one of your stocks moves 5% or more in a day.' },
  { key: 'upcoming_earnings', label: 'Earnings coming up', description: 'A heads-up before a company reports results.' },
  { key: 'dividend_reminder', label: 'Dividend dates', description: 'Before a stock goes ex-dividend, so you know when to own it.' },
];

export function AlertsStep({
  alerts,
  onChange,
  onContinue,
  onBack,
  stepIndex,
  totalSteps,
}: {
  alerts: AlertChoices;
  onChange: (alerts: AlertChoices) => void;
  onContinue: () => void;
  onBack: () => void;
  stepIndex: number;
  totalSteps: number;
}) {
  return (
    <StepShell stepIndex={stepIndex} totalSteps={totalSteps} onBack={onBack}>
      <StepHeadline text="What should we tell you" accent="about?" />
      <p style={{ margin: '0 0 24px', textAlign: 'center', fontSize: 15, color: 'var(--fg-muted)' }}>
        These show up in your BullPen notifications, only for the stocks you pick.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {ROWS.map((row) => {
          const on = alerts[row.key];
          const id = `alert-${row.key}`;
          return (
            <div
              key={row.key}
              style={{
                display: 'flex', alignItems: 'center', gap: 16, padding: '14px 18px', borderRadius: 14,
                border: '1px solid var(--border)', background: 'var(--surface)',
              }}
            >
              <label htmlFor={id} style={{ flex: 1, cursor: 'pointer' }}>
                <span style={{ display: 'block', fontSize: 15, fontWeight: 600, color: 'var(--fg)' }}>{row.label}</span>
                <span style={{ display: 'block', fontSize: 13, color: 'var(--fg-dim)' }}>{row.description}</span>
              </label>
              <button
                id={id}
                type="button"
                role="switch"
                aria-checked={on}
                onClick={() => onChange({ ...alerts, [row.key]: !on })}
                style={{
                  position: 'relative', width: 44, height: 26, flexShrink: 0, borderRadius: 999, border: 'none', cursor: 'pointer',
                  background: on ? 'var(--accent)' : 'var(--border-strong)', transition: 'background 180ms ease-out',
                }}
              >
                <span
                  aria-hidden
                  style={{
                    position: 'absolute', top: 3, left: 3, width: 20, height: 20, borderRadius: 999, background: 'white',
                    transform: `translateX(${on ? 18 : 0}px)`, transition: 'transform 180ms ease-out',
                  }}
                />
              </button>
            </div>
          );
        })}
      </div>
      <button type="button" className="btn btn-primary" onClick={onContinue} style={{ width: '100%', justifyContent: 'center', marginTop: 24 }}>
        Continue
      </button>
    </StepShell>
  );
}
