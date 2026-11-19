'use client';

import type { CSSProperties } from 'react';
import type { AlertChoices } from '@/lib/onboarding/pending-onboarding';
import { StepHeadline, StepShell } from './StepShell';

type Row = { key: keyof AlertChoices; label: string; description: string };

// Each writes settings.notifications (lib/onboarding/flush.ts): the four in-app
// kinds land in the bell panel, and the morning email carries whichever of them
// are on. Phone push is per device and offered later, in Settings.
const IN_APP: Row[] = [
  { key: 'upcoming_earnings', label: 'Earnings coming up', description: 'A heads-up before one of your stocks reports results.' },
  { key: 'price_alerts', label: 'Big price moves', description: 'When one of your stocks moves 5% or more in a day.' },
  { key: 'dividend_reminder', label: 'Dividend dates', description: "Before a stock's dividend cutoff date, so you know when to own it." },
  { key: 'learning', label: 'Academy', description: 'Streak reminders and new courses.' },
];
const EMAIL: Row = {
  key: 'email_alerts',
  label: 'Morning email',
  description: "One short email with the stock alerts above and how your watchlist did. Turn it off if you'd rather just check the app.",
};

const groupLabel: CSSProperties = {
  margin: '0 0 8px 4px', fontSize: 14, fontWeight: 600, color: 'var(--fg-muted)',
};

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
  const toggle = (row: Row) => {
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
            background: on ? 'var(--accent)' : 'var(--fg-dim)', transition: 'background 180ms ease-out',
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
  };

  return (
    <StepShell stepIndex={stepIndex} totalSteps={totalSteps} onBack={onBack}>
      <StepHeadline text="What should we tell you about?" />
      <p style={{ margin: '0 0 24px', textAlign: 'center', fontSize: 15, color: 'var(--fg-muted)', textWrap: 'balance' }}>
        Alerts show up in your notifications in BullPen. Change them anytime in Settings.
      </p>
      <section aria-labelledby="alerts-in-app">
        <h2 id="alerts-in-app" style={groupLabel}>In the app</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{IN_APP.map(toggle)}</div>
      </section>
      <section aria-labelledby="alerts-email" style={{ marginTop: 24 }}>
        <h2 id="alerts-email" style={groupLabel}>By email</h2>
        {toggle(EMAIL)}
      </section>
      <button type="button" className="btn btn-primary" onClick={onContinue} style={{ width: '100%', justifyContent: 'center', marginTop: 24 }}>
        Continue
      </button>
    </StepShell>
  );
}
