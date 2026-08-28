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

interface AuthFormLoginProps {
  onSuccess?: () => void;
  onError?: (error: string) => void;
  onForgotPassword?: () => void;
  redirectTo?: string;
}

export function AuthFormLogin({ onSuccess, onError, onForgotPassword }: AuthFormLoginProps) {
  const { t } = useTranslation('auth');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email || !password) {
      const errorMsg = t('loginMissingFields');
      setError(errorMsg);
      onError?.(errorMsg);
      return;
    }

    setIsLoading(true);

    try {
      const result = await signIn({ email, password });

      if (!result.success) {
        const errorMsg = result.error || t('loginFailed');
        setError(errorMsg);
        onError?.(errorMsg);
        setIsLoading(false);
        return;
      }

      setIsLoading(false);
      onSuccess?.();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : t('unexpectedError');
      setError(errorMsg);
      onError?.(errorMsg);
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
              className="text-xs text-muted-foreground hover:text-primary transition-colors"
            >
              {t('forgotPasswordLink')}
            </button>
          )}
        </div>
        <PasswordInput
          id="login-password"
          placeholder="••••••••"
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
        disabled={isLoading || !isValid}
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
