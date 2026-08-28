'use client';

import { useState, FormEvent } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Loader2, MailCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { sendPasswordResetEmail } from '@/lib/auth/auth';

interface AuthFormForgotPasswordProps {
  onBack: () => void;
}

export function AuthFormForgotPassword({ onBack }: AuthFormForgotPasswordProps) {
  const { t } = useTranslation('auth');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email.includes('@')) {
      setError(t('forgotInvalidEmail'));
      return;
    }

    setIsLoading(true);
    const result = await sendPasswordResetEmail(email);
    setIsLoading(false);

    if (!result.success) {
      setError(result.error || t('forgotSendFailed'));
      return;
    }

    setSent(true);
  };

  if (sent) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="space-y-5"
      >
        <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
          <MailCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <p>
            <Trans
              i18nKey="forgotSentMessage"
              ns="auth"
              values={{ email }}
              components={{ strong: <span className="font-medium text-foreground" /> }}
            />
          </p>
        </div>
        <Button type="button" variant="outline" className="h-11 w-full rounded-lg" onClick={onBack}>
          {t('backToSignIn')}
        </Button>
      </motion.div>
    );
  }

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
        <Label htmlFor="forgot-email" className="text-sm font-medium">
          {t('emailLabel')}
        </Label>
        <Input
          id="forgot-email"
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

      <Button
        type="submit"
        className="h-11 w-full rounded-lg"
        disabled={isLoading || !email.includes('@')}
      >
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {t('forgotSendingLink')}
          </>
        ) : (
          t('forgotSendLink')
        )}
      </Button>

      <Button type="button" variant="ghost" className="h-11 w-full rounded-lg" onClick={onBack}>
        {t('backToSignIn')}
      </Button>
    </motion.form>
  );
}
