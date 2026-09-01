'use client';

import { useState, FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { PasswordInput } from './PasswordInput';
import { Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { signUp } from '@/lib/auth/auth';
import { cn } from '@/lib/utils';
import { trackEvent } from '@/lib/analytics/track';

interface AuthFormSignupProps {
  onSuccess?: () => void;
  onError?: (error: string) => void;
  submitLabel?: string;
  submitLoadingLabel?: string;
  submitClassName?: string;
  /** Which funnel this form is embedded in, for signup_form_* events — e.g. 'register', 'get_started'. */
  source?: string;
}

export function AuthFormSignup({
  onSuccess,
  onError,
  submitLabel,
  submitLoadingLabel,
  submitClassName,
  source = 'unknown',
}: AuthFormSignupProps) {
  const { t } = useTranslation('auth');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
    if (password.length < 8) {
      return t('signupPasswordTooShort');
    }
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
      const result = await signUp({ email, password });

      if (!result.success) {
        const errorMsg = result.error || t('signupFailed');
        setError(errorMsg);
        onError?.(errorMsg);
        trackEvent('signup_form_failed', { source, method: 'email', reason: 'signup_error' });
        setIsLoading(false);
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

  const isValid = email.includes('@') && password.length >= 8;

  return (
    <motion.form
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onSubmit={handleSubmit}
      className="space-y-5"
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

      <Button
        type="submit"
        className={cn('h-11 w-full rounded-lg', submitClassName)}
        disabled={isLoading || !isValid}
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
