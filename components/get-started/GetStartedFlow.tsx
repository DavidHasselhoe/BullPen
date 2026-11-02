'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { trackEvent } from '@/lib/analytics/track';
import {
  clearDraft,
  DEFAULT_ALERTS,
  readDraft,
  saveDraft,
  savePendingOnboarding,
  type OnboardingDraft,
} from '@/lib/onboarding/pending-onboarding';
import { ExplainStyleStep } from './ExplainStyleStep';
import { PickStocksStep } from './PickStocksStep';
import { AlertsStep } from './AlertsStep';
import { PreviewStep } from './PreviewStep';

/** 4 screens here plus the trial offer at /get-started/trial, for the progress bar. */
export const TOTAL_STEPS = 5;
const STEP_KEYS = ['explain_style', 'pick_stocks', 'alerts', 'preview'] as const;

export function GetStartedFlow({ signedIn = false }: { signedIn?: boolean }) {
  // Mounts only after GetStartedPage's auth gate, never in the SSR tree, so
  // reading sessionStorage in the initializer can't cause a hydration mismatch.
  const [step, setStep] = useState(() => readDraft()?.step ?? 0);
  const [draft, setDraft] = useState<OnboardingDraft>(
    () => readDraft()?.draft ?? { picks: [], alerts: DEFAULT_ALERTS }
  );

  useEffect(() => {
    saveDraft(step, draft);
  }, [step, draft]);

  useEffect(() => {
    trackEvent('get_started_step_viewed', { step_key: STEP_KEYS[step], step_number: step + 1 });
  }, [step]);

  // Reaching the preview means every choice is made: stage it for the
  // post-signup flush and drop the draft.
  useEffect(() => {
    if (step !== 3 || !draft.style) return;
    savePendingOnboarding({ style: draft.style, picks: draft.picks, alerts: draft.alerts });
    clearDraft();
  }, [step, draft]);

  // A resumed draft can predate a required choice: no style can't render the
  // later screens, and no picks (once allowed) would preview an empty list.
  const safeStep = step > 0 && !draft.style ? 0 : step > 1 && draft.picks.length === 0 ? 1 : step;

  return (
    <div style={{ padding: '80px 0' }}>
      <div className="wrap">
        {/* Fires only on a step change, after the old screen leaves. Without it
            the next screen opened at the old scroll offset (alerts arrived on
            its Continue button, its explanation off screen), and keyboard and
            screen-reader focus stayed on a button that no longer exists. */}
        <AnimatePresence
          mode="wait"
          onExitComplete={() => {
            document.querySelector('.app-scroll')?.scrollTo(0, 0);
            window.scrollTo(0, 0);
            requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-step-heading]')?.focus({ preventScroll: true }));
          }}
        >
          {safeStep === 0 && (
            <ExplainStyleStep
              key="explain_style"
              value={draft.style}
              stepIndex={0}
              totalSteps={TOTAL_STEPS}
              onSelect={(style) => {
                trackEvent('get_started_step_answered', { step_key: 'explain_style', step_number: 1, value: style });
                setDraft((d) => ({ ...d, style }));
                setStep(1);
              }}
            />
          )}
          {safeStep === 1 && (
            <PickStocksStep
              key="pick_stocks"
              picks={draft.picks}
              stepIndex={1}
              totalSteps={TOTAL_STEPS}
              onChange={(picks) => setDraft((d) => ({ ...d, picks }))}
              onBack={() => setStep(0)}
              onContinue={() => {
                trackEvent('stocks_picked', { count: draft.picks.length });
                setStep(2);
              }}
            />
          )}
          {safeStep === 2 && (
            <AlertsStep
              key="alerts"
              alerts={draft.alerts}
              stepIndex={2}
              totalSteps={TOTAL_STEPS}
              onChange={(alerts) => setDraft((d) => ({ ...d, alerts }))}
              onBack={() => setStep(1)}
              onContinue={() => {
                trackEvent('alerts_chosen', { ...draft.alerts });
                setStep(3);
              }}
            />
          )}
          {safeStep === 3 && draft.style && (
            <PreviewStep
              key="preview"
              picks={draft.picks}
              alerts={draft.alerts}
              stepIndex={3}
              totalSteps={TOTAL_STEPS}
              onBack={() => setStep(2)}
              signedIn={signedIn}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
