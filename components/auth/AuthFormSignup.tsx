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

interface FieldError {
  field: 'email' | 'password' | 'dob' | 'accept';
  message: string;
}

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
  // The date field verifies the age; this is the account holder representing
  // it and accepting the terms, which nothing asked for before.
  const [accepted, setAccepted] = useState(false);
  // Server outcomes (signup failed, check your inbox) show above the button;
  // a rule the form itself checks shows under the field it is about.
  const [error, setError] = useState('');
  const [fieldError, setFieldError] = useState<FieldError | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const resolvedSubmitLabel = submitLabel ?? t('signupSubmit');
  const resolvedSubmitLoadingLabel = submitLoadingLabel ?? t('signupSubmitting');

  const validateForm = (): FieldError | null => {
    if (!email) return { field: 'email', message: t('signupEmailRequired') };
    if (!email.includes('@')) return { field: 'email', message: t('forgotInvalidEmail') };
    if (!password) return { field: 'password', message: t('signupPasswordRequired') };
    const strengthError = getPasswordStrengthError(password);
    if (strengthError === 'tooShort') return { field: 'password', message: t('signupPasswordTooShort') };
    if (strengthError === 'tooWeak') return { field: 'password', message: t('signupPasswordTooWeak') };
    if (strengthError === 'tooCommon') return { field: 'password', message: t('signupPasswordTooCommon') };
    const dobError = checkDateOfBirth(dob);
    if (dobError) {
      if (dobError === 'tooYoung') {
        rememberAgeGateFailure();
        setAgeBlocked(true);
        return { field: 'dob', message: t('signupDobTooYoung', { minAge: MIN_SIGNUP_AGE_YEARS }) };
      }
      if (dobError === 'missing') return { field: 'dob', message: t('signupDobRequired') };
      if (dobError === 'future') return { field: 'dob', message: t('signupDobFuture') };
      return { field: 'dob', message: t('signupDobInvalid') };
    }
    if (!accepted) return { field: 'accept', message: t('signupAcceptRequired') };
    return null;
  };

  /** Typing in the field an error is about clears it. */
  const clearFieldError = (field: FieldError['field']) =>
    setFieldError((current) => (current?.field === field ? null : current));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    // The button stays pressable: disabled until every rule passed, it went
    // grey with no reason ("password1" fits the hint but is on the common
    // list), and these messages could never show.
    const validationError = validateForm();
    setFieldError(validationError);
    if (validationError) {
      onError?.(validationError.message);
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
  const invalid = (field: FieldError['field']) => fieldError?.field === field;
  const errorFor = (field: FieldError['field']) =>
    invalid(field) ? (
      <p id={`signup-${field}-error`} role="alert" className="text-xs text-destructive">
        {fieldError!.message}
      </p>
    ) : null;

  return (
    <motion.form
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onSubmit={handleSubmit}
      noValidate
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
          onChange={(e) => {
            setEmail(e.target.value);
            clearFieldError('email');
          }}
          disabled={isLoading}
          required
          autoComplete="email"
          autoFocus
          className="h-11"
          aria-invalid={invalid('email')}
          aria-describedby={invalid('email') ? 'signup-email-error' : undefined}
        />
        {errorFor('email')}
      </div>

      <div className="space-y-2">
        <Label htmlFor="signup-password" className="text-sm font-medium">
          {t('passwordLabel')}
        </Label>
        <PasswordInput
          id="signup-password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            clearFieldError('password');
          }}
          disabled={isLoading}
          required
          autoComplete="new-password"
          aria-invalid={invalid('password')}
          aria-describedby={invalid('password') ? 'signup-password-error' : 'signup-password-hint'}
          minLength={8}
        />
        {/* The rule replaces the hint while it is broken, so the reason sits where the hint was. */}
        {errorFor('password') ?? (
          <p id="signup-password-hint" className="text-xs text-muted-foreground">{t('signupPasswordHint')}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="signup-dob" className="text-sm font-medium">
          {t('signupDobLabel')}
        </Label>
        <DatePicker
          id="signup-dob"
          value={dob}
          onChange={(value) => {
            setDob(value);
            clearFieldError('dob');
          }}
          disabled={isLoading || blocked}
          min={minAllowedDobValue()}
          max={maxAllowedDobValue()}
          placeholder={t('signupDobPlaceholder')}
          className="h-11"
          aria-describedby={invalid('dob') ? 'signup-dob-error signup-dob-hint' : 'signup-dob-hint'}
          aria-invalid={invalid('dob')}
        />
        <p id="signup-dob-hint" className="text-xs text-muted-foreground">
          {t('signupDobHint', { minAge: MIN_SIGNUP_AGE_YEARS })}
        </p>
        {errorFor('dob')}
      </div>

      <div className="space-y-2">
        <div className="flex items-start gap-2.5">
          <Checkbox
            id="signup-accept"
            checked={accepted}
            onCheckedChange={(next) => {
              setAccepted(next === true);
              clearFieldError('accept');
            }}
            disabled={isLoading || blocked}
            className="mt-0.5"
            aria-invalid={invalid('accept')}
            aria-describedby={invalid('accept') ? 'signup-accept-error' : undefined}
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
        {errorFor('accept')}
      </div>

      {/* Server outcomes, and the age gate on a browser that already failed
          it: the form is closed, so it says so rather than greying out. */}
      {(error || (blocked && !fieldError)) && (
        <div
          className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          role="alert"
        >
          {error || t('signupDobBlocked')}
        </div>
      )}

      <Button
        type="submit"
        className={cn('h-11 w-full rounded-lg', submitClassName)}
        disabled={isLoading || blocked}
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
