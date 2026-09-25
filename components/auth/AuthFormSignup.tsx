'use client';

import { useState, FormEvent } from 'react';
import Link from 'next/link';
import { Trans, useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { PasswordInput } from './PasswordInput';
import { Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { signUp } from '@/lib/auth/auth';
import { getPasswordStrengthError } from '@/lib/auth/password-strength';
import { cn } from '@/lib/utils';
import { trackEvent } from '@/lib/analytics/track';
import {
  MIN_SIGNUP_AGE_YEARS,
  checkDateOfBirth,
  isAgeGateBlocked,
  maxAllowedDobValue,
  minAllowedDobValue,
  rememberAgeGateFailure,
} from '@/lib/auth/age-gate';

interface AuthFormSignupProps {
  onSuccess?: () => void;
  onError?: (error: string) => void;
  submitLabel?: string;
  submitLoadingLabel?: string;
  submitClassName?: string;
  /** Which funnel this form is embedded in, for signup_form_* events — e.g. 'register', 'get_started'. */
  source?: string;
  /** Where the email confirmation link lands after sign-in (relative path). Defaults to /dashboard. */
  emailRedirectPath?: string;
  /** Replaces the inline "check your inbox" error with the caller's own confirmation screen. */
  onConfirmationRequired?: (email: string, password: string) => void;
  /** Replaces the inline "email already in use" error with the caller's own notice. */
  onEmailInUse?: (email: string) => void;
}

export function AuthFormSignup({
  onSuccess,
  onError,
  submitLabel,
  submitLoadingLabel,
  submitClassName,
  source = 'unknown',
  emailRedirectPath,
  onConfirmationRequired,
  onEmailInUse,
}: AuthFormSignupProps) {
  const { t } = useTranslation('auth');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [dob, setDob] = useState('');
  // Set once an under-age date has been submitted. Keeps the form closed for
  // the rest of the session instead of inviting a second guess at the year.
  const [ageBlocked, setAgeBlocked] = useState(false);
  const [dobInvalid, setDobInvalid] = useState(false);
  // The date field verifies the age; this is the account holder representing
  // it and accepting the terms, which nothing asked for before.
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const resolvedSubmitLabel = submitLabel ?? t('signupSubmit');
  const resolvedSubmitLoadingLabel = submitLoadingLabel ?? t('signupSubmitting');

  const validateForm = (): string | null => {
    if (!email) {
      return t('signupEmailRequired');
    }
    if (!email.includes('@')) {
      return t('forgotInvalidEmail');
    }
    if (!password) {
      return t('signupPasswordRequired');
    }
    const dobError = checkDateOfBirth(dob);
    setDobInvalid(!!dobError);
    if (dobError) {
      if (dobError === 'tooYoung') {
        rememberAgeGateFailure();
        setAgeBlocked(true);
        return t('signupDobTooYoung', { minAge: MIN_SIGNUP_AGE_YEARS });
      }
      if (dobError === 'missing') return t('signupDobRequired');
      if (dobError === 'future') return t('signupDobFuture');
      return t('signupDobInvalid');
    }

    const strengthError = getPasswordStrengthError(password);
    if (strengthError === 'tooShort') return t('signupPasswordTooShort');
    if (strengthError === 'tooWeak') return t('signupPasswordTooWeak');
    if (strengthError === 'tooCommon') return t('signupPasswordTooCommon');
    if (!accepted) return t('signupAcceptRequired');
    return null;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      onError?.(validationError);
      return;
    }

    setIsLoading(true);
    trackEvent('signup_form_submitted', { source, method: 'email' });

    try {
      const result = await signUp({
        email,
        password,
        dateOfBirth: dob,
        termsAccepted: accepted,
        next: emailRedirectPath,
      });

      if (result.emailInUse) {
        trackEvent('signup_form_failed', { source, method: 'email', reason: 'email_in_use' });
        setIsLoading(false);
        if (onEmailInUse) {
          onEmailInUse(email);
        } else {
          const errorMsg = t('signupEmailInUse');
          setError(errorMsg);
          onError?.(errorMsg);
        }
        return;
      }

      if (!result.success) {
        const errorMsg = result.error || t('signupFailed');
        setError(errorMsg);
        onError?.(errorMsg);
        trackEvent('signup_form_failed', { source, method: 'email', reason: 'signup_error' });
        setIsLoading(false);
        return;
      }

      if (result.requiresEmailConfirmation && onConfirmationRequired) {
        trackEvent('signup_form_email_confirmation_required', { source, method: 'email' });
        setIsLoading(false);
        onConfirmationRequired(email, password);
        return;
      }

      if (result.requiresEmailConfirmation) {
        // Deliberately worded to read correctly whether this is a genuine new
        // signup or an already-registered email that lib/auth/auth.ts masks
        // behind the same success response (anti-enumeration: revealing which
        // case happened would let the signup form be used to probe registered
        // emails). Never say "check your email" alone here — for the masked
        // duplicate case no email is actually sent, so that phrasing alone
        // reads as a bug. The "or sign in" clause is the honest nudge for
        // that case without confirming it outright.
        const errorMsg = t('signupCheckInbox');
        setError(errorMsg);
        onError?.(errorMsg);
        // Genuinely ambiguous here (by design, see above) whether this was a
        // real signup or a masked duplicate-email attempt — tracked as its
        // own outcome rather than folded into failed/succeeded, which would
        // misrepresent one of the two real cases either way.
        trackEvent('signup_form_email_confirmation_required', { source, method: 'email' });
        setIsLoading(false);
        return;
      }

      trackEvent('signup_form_succeeded', { source, method: 'email' });
      onSuccess?.();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : t('unexpectedError');
      setError(errorMsg);
      onError?.(errorMsg);
      trackEvent('signup_form_failed', { source, method: 'email', reason: 'exception' });
      setIsLoading(false);
    }
  };

  const blocked = ageBlocked || isAgeGateBlocked();
  const isValid =
    email.includes('@') &&
    getPasswordStrengthError(password) === null &&
    checkDateOfBirth(dob) === null &&
    accepted;

  return (
    <motion.form
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onSubmit={handleSubmit}
      className="space-y-5 ph-no-capture"
    >
      <div className="space-y-2">
        <Label htmlFor="signup-email" className="text-sm font-medium">
          {t('emailLabel')}
        </Label>
        <Input
          id="signup-email"
          type="email"
          placeholder={t('emailPlaceholder')}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={isLoading}
          required
          autoComplete="email"
          autoFocus
          className="h-11"
          aria-invalid={!!error && error.toLowerCase().includes('email')}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="signup-password" className="text-sm font-medium">
          {t('passwordLabel')}
        </Label>
        <PasswordInput
          id="signup-password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={isLoading}
          required
          autoComplete="new-password"
          aria-invalid={!!error && error.toLowerCase().includes('password')}
          minLength={8}
        />
        <p className="text-xs text-muted-foreground">{t('signupPasswordHint')}</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="signup-dob" className="text-sm font-medium">
          {t('signupDobLabel')}
        </Label>
        <DatePicker
          id="signup-dob"
          value={dob}
          onChange={setDob}
          disabled={isLoading || blocked}
          min={minAllowedDobValue()}
          max={maxAllowedDobValue()}
          placeholder={t('signupDobPlaceholder')}
          className="h-11"
          aria-describedby="signup-dob-hint"
          aria-invalid={dobInvalid}
        />
        <p id="signup-dob-hint" className="text-xs text-muted-foreground">
          {t('signupDobHint', { minAge: MIN_SIGNUP_AGE_YEARS })}
        </p>
      </div>

      <div className="flex items-start gap-2.5">
        <Checkbox
          id="signup-accept"
          checked={accepted}
          onCheckedChange={(next) => setAccepted(next === true)}
          disabled={isLoading || blocked}
          className="mt-0.5"
        />
        <Label htmlFor="signup-accept" className="text-xs font-normal leading-relaxed text-muted-foreground">
          <Trans
            i18nKey="signupAcceptLabel"
            ns="auth"
            values={{ minAge: MIN_SIGNUP_AGE_YEARS }}
            components={{
              terms: <Link href="/terms" target="_blank" className="underline underline-offset-2 hover:text-foreground" />,
              privacy: <Link href="/privacy" target="_blank" className="underline underline-offset-2 hover:text-foreground" />,
            }}
          />
        </Label>
      </div>

      <Button
        type="submit"
        className={cn('h-11 w-full rounded-lg', submitClassName)}
        disabled={isLoading || !isValid || blocked}
      >
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {resolvedSubmitLoadingLabel}
          </>
        ) : (
          resolvedSubmitLabel
        )}
      </Button>
    </motion.form>
  );
}
