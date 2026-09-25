'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { DatePicker } from '@/components/ui/date-picker';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/components/auth/AuthProvider';
import { createBrowserClient } from '@/lib/supabase/client';
import { signOut } from '@/lib/auth/auth';
import {
  MIN_SIGNUP_AGE_YEARS,
  checkDateOfBirth,
  maxAllowedDobValue,
  minAllowedDobValue,
  rememberAgeGateFailure,
} from '@/lib/auth/age-gate';

/**
 * The half of the age gate that the signup form can't cover.
 *
 * Google sign-in never touches AuthFormSignup, and Google doesn't hand us a
 * birthday, so an OAuth account arrives with no date of birth at all. Accounts
 * that existed before the gate shipped (2026-09-22) are in the same position.
 * Both get asked here, once, and can't use the app until they answer: a gate
 * that only covers the email form is not a gate.
 *
 * An under-13 answer signs the account out on the spot. Deleting the account
 * outright would be the stronger reading of COPPA, but it is destructive and
 * irreversible on a self-reported number, so the account is locked out of the
 * app instead and left for a human to remove. See AGE_POLICY_NOTE.
 */
export function AgeCheckGate() {
  const { t } = useTranslation('auth');
  const { user, isLoading, refresh } = useAuth();
  const [dob, setDob] = useState('');
  const [error, setError] = useState('');
  const [tooYoung, setTooYoung] = useState(false);
  const [saving, setSaving] = useState(false);

  const needsAnswer = !isLoading && !!user && !user.date_of_birth;

  const handleSubmit = async () => {
    const problem = checkDateOfBirth(dob);
    if (problem === 'tooYoung') {
      rememberAgeGateFailure();
      setTooYoung(true);
      await signOut().catch(() => {});
      return;
    }
    if (problem) {
      setError(problem === 'missing' ? t('signupDobRequired') : problem === 'future' ? t('signupDobFuture') : t('signupDobInvalid'));
      return;
    }

    setSaving(true);
    setError('');
    try {
      const supabase = createBrowserClient();
      // Through the RPC, not a direct .update(): the authenticated role holds
      // no UPDATE grant on this column (migration 121 scoped them), and the
      // function is where write-once and the age re-check live. A request
      // that skips this component still meets both.
      const { error: writeError } = await supabase.rpc('set_own_date_of_birth', { dob });
      if (writeError) {
        setError(t('ageCheckFailed'));
        setSaving(false);
        return;
      }
      await refresh();
    } catch {
      setError(t('ageCheckFailed'));
      setSaving(false);
    }
  };

  if (tooYoung) {
    return (
      <Dialog open>
        <DialogContent showCloseButton={false} className="sm:max-w-md">
          <DialogTitle>{t('ageCheckTooYoungTitle')}</DialogTitle>
          <DialogDescription>{t('ageCheckTooYoungBody', { minAge: MIN_SIGNUP_AGE_YEARS })}</DialogDescription>
        </DialogContent>
      </Dialog>
    );
  }

  if (!needsAnswer) return null;

  return (
    <Dialog open>
      <DialogContent
        showCloseButton={false}
        // No escape route except answering or signing out: dismissing it would
        // put an un-aged account straight back into the app.
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        className="sm:max-w-md"
      >
        <DialogTitle>{t('ageCheckTitle')}</DialogTitle>
        <DialogDescription>{t('ageCheckBody', { minAge: MIN_SIGNUP_AGE_YEARS })}</DialogDescription>

        <div className="mt-2 space-y-2">
          <Label htmlFor="age-check-dob" className="text-sm font-medium">
            {t('signupDobLabel')}
          </Label>
          <DatePicker
            id="age-check-dob"
            value={dob}
            onChange={setDob}
            disabled={saving}
            min={minAllowedDobValue()}
            max={maxAllowedDobValue()}
            placeholder={t('signupDobPlaceholder')}
            className="h-11"
            aria-invalid={!!error}
            aria-describedby={error ? 'age-check-error' : undefined}
          />
          {error && (
            <p id="age-check-error" role="alert" className="text-xs text-destructive">
              {error}
            </p>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <Button variant="ghost" size="sm" onClick={() => void signOut()} disabled={saving}>
            {t('ageCheckSignOut')}
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={saving || checkDateOfBirth(dob) !== null}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('ageCheckSaving')}
              </>
            ) : (
              t('ageCheckSubmit')
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
