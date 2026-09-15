'use client';

import type { AlertChoices, StockPick } from '@/lib/onboarding/pending-onboarding';
import { GetStartedSignupForm } from './GetStartedSignupForm';
import { StepShell } from './StepShell';

// Temporary: replaced entirely by the live preview in Task 6 of
// docs/superpowers/plans/2026-09-15-onboarding-trial-paywall.md.
export function PreviewStep(props: {
  picks: StockPick[];
  alerts: AlertChoices;
  stepIndex: number;
  totalSteps: number;
  onBack: () => void;
}) {
  return (
    <StepShell stepIndex={props.stepIndex} totalSteps={props.totalSteps} onBack={props.onBack} maxWidth={560}>
      <GetStartedSignupForm />
    </StepShell>
  );
}
