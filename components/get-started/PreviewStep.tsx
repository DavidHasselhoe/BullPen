'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { flushPendingOnboardingData } from '@/lib/onboarding/flush';
import { trackEvent } from '@/lib/analytics/track';
import { motion, useReducedMotion } from 'framer-motion';
import { Bell, BellOff } from 'lucide-react';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import type { AlertChoices, StockPick } from '@/lib/onboarding/pending-onboarding';
import { GetStartedSignupForm } from './GetStartedSignupForm';
import { StepHeadline, StepShell, StockLabel } from './StepShell';

interface Quote { price: number; change: number; changePercent: number; stale?: boolean }

const MAX_SHOWN = 6;
const ALERT_WORDS: Record<keyof AlertChoices, string> = {
  price_alerts: 'big price moves',
  upcoming_earnings: 'earnings',
  dividend_reminder: 'dividend dates',
};

function alertsSentence(alerts: AlertChoices): string {
  const on = (Object.keys(alerts) as (keyof AlertChoices)[]).filter((k) => alerts[k]).map((k) => ALERT_WORDS[k]);
  if (on.length === 0) return 'Alerts are off. You can turn them on anytime in Settings.';
  const list = on.length === 1 ? on[0] : `${on.slice(0, -1).join(', ')} and ${on[on.length - 1]}`;
  return `We'll email you in the morning about ${list} for these stocks.`;
}

export function PreviewStep({
  picks,
  alerts,
  stepIndex,
  totalSteps,
  onBack,
  signedIn = false,
}: {
  picks: StockPick[];
  alerts: AlertChoices;
  stepIndex: number;
  totalSteps: number;
  onBack: () => void;
  signedIn?: boolean;
}) {
  const reduceMotion = useReducedMotion();
  // The pick step requires one stock, so picks is never empty here.
  const shown: StockPick[] = picks.slice(0, MAX_SHOWN);
  const hiddenCount = picks.length - shown.length;
  const tickers = shown.map((s) => s.ticker);
  const AlertIcon = Object.values(alerts).some(Boolean) ? Bell : BellOff;

  const { data: quotes } = useQuery({
    queryKey: ['onboarding-preview-quotes', tickers],
    queryFn: async (): Promise<Record<string, Quote>> => {
      const res = await fetch('/api/quotes/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols: tickers }),
      });
      if (!res.ok) return {};
      return (await res.json()).quotes ?? {};
    },
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const { data: scores } = useQuery({
    queryKey: ['onboarding-preview-scores', tickers],
    queryFn: async (): Promise<Record<string, { score: number; grade: string }>> => {
      const res = await fetch(`/api/onboarding/health-scores?symbols=${encodeURIComponent(tickers.join(','))}`);
      if (!res.ok) return {};
      return (await res.json()).scores ?? {};
    },
    staleTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  return (
    <StepShell stepIndex={stepIndex} totalSteps={totalSteps} onBack={onBack} maxWidth={480}>
      <StepHeadline text="Your BullPen is" accent="ready." />
      <p style={{ margin: '0 0 24px', textAlign: 'center', fontSize: 15, color: 'var(--fg-muted)' }}>
        Your watchlist, live.
      </p>

      {/* One container with divided rows reads as a watchlist, not a stack of
          separate cards. Rows arrive one after another, which is the one bit
          of motion on this screen: the list is the thing being handed over. */}
      <ul
        style={{
          listStyle: 'none', margin: 0, padding: 0, borderRadius: 18, overflow: 'hidden',
          border: '1px solid var(--border)', background: 'var(--surface)',
        }}
      >
        {shown.map((s, i) => {
          const q = quotes?.[s.ticker];
          const hs = scores?.[s.ticker];
          const up = (q?.changePercent ?? 0) >= 0;
          return (
            <motion.li
              key={s.ticker}
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.32, delay: 0.1 + i * 0.07, ease: [0.22, 1, 0.36, 1] }}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
                borderTop: i === 0 ? 'none' : '1px solid var(--border)',
              }}
            >
              <CompanyLogo name={s.name} ticker={s.ticker} size={32} decorative />
              {/* "Health 95 (A)" read as 95 of what; the scale goes in the words. */}
              <StockLabel name={s.name} ticker={s.ticker} detail={hs ? `Health score ${hs.score} of 100` : undefined} />
              {q ? (
                <span style={{ textAlign: 'right' }}>
                  <span className="mono" style={{ display: 'block', fontSize: 15, fontWeight: 600, color: 'var(--fg)' }}>${q.price.toFixed(2)}</span>
                  <span className={`mono ${up ? 'up' : 'down'}`} style={{ display: 'block', fontSize: 13 }}>
                    {up ? '▲ +' : '▼ −'}{Math.abs(q.changePercent).toFixed(2)}%{q.stale ? ' last close' : ''}
                  </span>
                </span>
              ) : (
                <span aria-hidden style={{ display: 'grid', gap: 6, justifyItems: 'end' }}>
                  <span style={{ width: 64, height: 14, borderRadius: 4, background: 'var(--border)' }} />
                  <span style={{ width: 44, height: 12, borderRadius: 4, background: 'var(--border)' }} />
                </span>
              )}
            </motion.li>
          );
        })}
        {hiddenCount > 0 && (
          <li style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', fontSize: 13, color: 'var(--fg-dim)', textAlign: 'center' }}>
            +{hiddenCount} more in your watchlist
          </li>
        )}
      </ul>

      {/* Icon inline with the text, not a flex sibling: when the sentence wraps
          on a phone, a flex icon floats alone at the left edge. */}
      <p style={{ margin: '16px 0 0', fontSize: 14, lineHeight: 1.5, color: 'var(--fg-muted)', textAlign: 'center', textWrap: 'balance' }}>
        <AlertIcon size={15} aria-hidden style={{ display: 'inline', verticalAlign: '-2px', marginRight: 6 }} />
        {alertsSentence(alerts)}
      </p>

      {signedIn ? <SaveSetupButton /> : <GetStartedSignupForm />}
    </StepShell>
  );
}

/** The account already exists (see /auth/callback): save the choices now and go on to the trial offer. */
function SaveSetupButton() {
  const { user, refresh } = useAuth();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  const save = async () => {
    if (!user) return;
    setSaving(true);
    setFailed(false);
    trackEvent('get_started_completed', { signed_in: true });
    // Never throws. On a failure the staged choices stay put, so the button
    // simply retries them; moving on would leave an empty watchlist.
    const ok = await flushPendingOnboardingData(user.id);
    if (!ok) {
      setSaving(false);
      setFailed(true);
      return;
    }
    await refresh();
    router.replace('/get-started/trial');
  };

  return (
    <div style={{ marginTop: 32 }}>
      {failed && (
        // Same treatment as the signup form's errors (GetStartedSignupForm).
        <div
          role="alert"
          style={{
            marginBottom: 12, padding: '10px 14px', borderRadius: 10, fontSize: 14,
            border: '1px solid oklch(from var(--down) l c h / 0.4)',
            background: 'oklch(from var(--down) l c h / 0.1)', color: 'var(--down)',
          }}
        >
          We couldn&apos;t save your stocks. Check your connection and try again.
        </div>
      )}
      <button type="button" className="btn btn-primary" onClick={save} disabled={saving || !user} aria-busy={saving} style={{ width: '100%', justifyContent: 'center' }}>
        {saving ? 'Saving…' : failed ? 'Try again' : 'Save and continue'}
      </button>
    </div>
  );
}
