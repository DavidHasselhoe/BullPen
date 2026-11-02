'use client';

import { useState, useSyncExternalStore } from 'react';
import type { AlertChoices, PendingPush } from '@/lib/onboarding/pending-onboarding';
import { isPushSupported, needsHomeScreenInstall, subscribeThisDevice } from '@/lib/push/client';
import { StepHeadline, StepShell } from './StepShell';

const ROWS: { key: keyof AlertChoices; label: string; description: string }[] = [
  { key: 'price_alerts', label: 'Big price moves', description: 'When one of your stocks moves 5% or more in a day.' },
  { key: 'upcoming_earnings', label: 'Earnings coming up', description: 'A heads-up before a company reports results.' },
  { key: 'dividend_reminder', label: 'Dividend dates', description: "Before a stock's dividend cutoff date, so you know when to own it." },
  { key: 'learning', label: 'Learning', description: 'Streak reminders and new courses.' },
];

const noopSubscribe = () => () => {};

export function AlertsStep({
  alerts,
  pushSubscription,
  onPushSubscription,
  onChange,
  onContinue,
  onBack,
  stepIndex,
  totalSteps,
}: {
  alerts: AlertChoices;
  pushSubscription?: PendingPush;
  onPushSubscription: (p: PendingPush) => void;
  onChange: (alerts: AlertChoices) => void;
  onContinue: () => void;
  onBack: () => void;
  stepIndex: number;
  totalSteps: number;
}) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  // False on the server and during hydration, then the real answer: a resumed draft renders this step while hydrating.
  const canPush = useSyncExternalStore(noopSubscribe, () => isPushSupported() && !needsHomeScreenInstall(), () => false);

  async function sendToPhone() {
    setBusy(true);
    setFailed(false);
    try {
      // Held until signup: there is no account to save the device to yet.
      onPushSubscription({ sub: await subscribeThisDevice(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone });
    } catch (e) {
      console.error('[push] onboarding subscribe:', e);
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <StepShell stepIndex={stepIndex} totalSteps={totalSteps} onBack={onBack}>
      <StepHeadline text="What should we tell you about?" />
      {/* The morning email leads: it is the one thing that has brought people
          back, and it was a subordinate clause in a four-line paragraph. */}
      <p style={{ margin: '0 0 24px', textAlign: 'center', fontSize: 15, color: 'var(--fg-muted)', textWrap: 'balance' }}>
        When something happens to your stocks, we send one short email in the morning. Turn it off anytime.
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
      {canPush && (
        <div style={{ marginTop: 16, textAlign: 'center' }}>
          {pushSubscription ? (
            <p role="status" style={{ margin: 0, fontSize: 14, color: 'var(--fg-muted)' }}>Done. These will come to this phone or computer.</p>
          ) : (
            <button type="button" className="btn" onClick={sendToPhone} disabled={busy}>
              Send these to my phone
            </button>
          )}
          {failed && <p role="alert" style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--fg-muted)' }}>We could not turn on notifications. You can try again in Settings.</p>}
        </div>
      )}
      <button type="button" className="btn btn-primary" onClick={onContinue} style={{ width: '100%', justifyContent: 'center', marginTop: 24 }}>
        Continue
      </button>
    </StepShell>
  );
}
