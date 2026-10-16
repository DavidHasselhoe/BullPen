'use client';

import { useState, FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { PasswordInput } from './PasswordInput';
import { Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { signIn } from '@/lib/auth/auth';
import { trackEvent } from '@/lib/analytics/track';

interface AuthFormLoginProps {
  onSuccess?: () => void;
  onError?: (error: string) => void;
  onForgotPassword?: () => void;
  redirectTo?: string;
  /** Which surface this form is embedded in, for login_form_* events — e.g. 'login', 'modal'. */
  source?: string;
}

export function AuthFormLogin({ onSuccess, onError, onForgotPassword, source = 'unknown' }: AuthFormLoginProps) {
  const { t } = useTranslation('auth');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  // A wrong password gets a reset link inside the error, where the person is looking.
  const [offerReset, setOfferReset] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setOfferReset(false);

    if (!email || !password) {
      const errorMsg = t('loginMissingFields');
      setError(errorMsg);
      onError?.(errorMsg);
      return;
    }

    setIsLoading(true);
    trackEvent('login_form_submitted', { source, method: 'email' });

    try {
      const result = await signIn({ email, password });

      if (!result.success) {
        // Supabase's own wording ("Invalid login credentials") is English and
        // jargon; the known failures are said in the user's language instead.
        const errorMsg =
          result.errorCode === 'invalid_credentials' ? t('loginInvalidCredentials')
          : result.errorCode === 'email_not_confirmed' ? t('loginEmailNotConfirmed')
          : result.errorCode === 'network' ? t('loginNetworkError')
          : result.errorCode === 'rate_limited' ? t('loginRateLimited')
          : result.error || t('loginFailed');
        setOfferReset(result.errorCode === 'invalid_credentials' && !!onForgotPassword);
        setError(errorMsg);
        onError?.(errorMsg);
        trackEvent('login_form_failed', { source, method: 'email' });
        setIsLoading(false);
        return;
      }

      trackEvent('login_form_succeeded', { source, method: 'email' });
      setIsLoading(false);
      onSuccess?.();
    } catch {
      const errorMsg = t('unexpectedError');
      setError(errorMsg);
      onError?.(errorMsg);
      trackEvent('login_form_failed', { source, method: 'email' });
      setIsLoading(false);
    }
  };

  return (
    <motion.form
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onSubmit={handleSubmit}
      className="space-y-5 ph-no-capture"
    >
      <AnimatePresence mode="wait">
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
            role="alert"
          >
            {error}
            {offerReset && (
              <>
                {' '}
                <button type="button" onClick={onForgotPassword} className="font-medium underline underline-offset-2 hover:text-foreground">
                  {t('forgotPasswordLink')}
                </button>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="space-y-2">
        <Label htmlFor="login-email" className="text-sm font-medium">
          {t('emailLabel')}
        </Label>
        <Input
          id="login-email"
          type="email"
          placeholder={t('emailPlaceholder')}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={isLoading}
          required
          autoComplete="email"
          autoFocus
          className="h-11"
          aria-invalid={!!error}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="login-password" className="text-sm font-medium">
            {t('passwordLabel')}
          </Label>
          {onForgotPassword && (
            <button
              type="button"
              onClick={onForgotPassword}
              className="rounded-sm text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {t('forgotPasswordLink')}
            </button>
          )}
        </div>
        <PasswordInput
          id="login-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={isLoading}
          required
          autoComplete="current-password"
          aria-invalid={!!error}
        />
      </div>

      <Button
        type="submit"
        className="h-11 w-full rounded-lg"
        disabled={isLoading}
      >
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {t('loginSigningIn')}
          </>
        ) : (
          t('loginSubmit')
        )}
      </Button>
    </motion.form>
  );
}
