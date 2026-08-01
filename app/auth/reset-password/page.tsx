'use client';

/**
 * Password Reset Landing Page
 *
 * Supabase redirects here from the password reset email with a ?code= param
 * (PKCE flow, same mechanism as /auth/callback). We exchange it for a recovery
 * session, then let the user set a new password via updateUser().
 */

import { Suspense, useEffect, useState, FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createBrowserClient } from '@/lib/supabase/client';
import { PasswordInput } from '@/components/auth/PasswordInput';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

type Status = 'verifying' | 'ready' | 'invalid' | 'submitting' | 'done';

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<Status>('verifying');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const code = searchParams.get('code');
    const supabase = createBrowserClient();

    if (!code) {
      // Page reload after the code was already exchanged still has a valid recovery session.
      supabase.auth.getSession().then(({ data: { session } }) => {
        setStatus(session ? 'ready' : 'invalid');
      });
      return;
    }

    supabase.auth.exchangeCodeForSession(code).then(({ error: exErr }) => {
      setStatus(exErr ? 'invalid' : 'ready');
    });
  }, [searchParams]);

  const isValid = password.length >= 8 && password === confirmPassword;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!isValid) return;

    setError('');
    setStatus('submitting');

    const supabase = createBrowserClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setError(updateError.message || 'Failed to update password.');
      setStatus('ready');
      return;
    }

    setStatus('done');
    setTimeout(() => router.replace('/dashboard'), 1800);
  };

  if (status === 'verifying') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (status === 'invalid') {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="w-full max-w-sm space-y-4 text-center"
        >
          <p className="text-sm font-medium text-foreground">This reset link is invalid or has expired</p>
          <p className="text-sm text-muted-foreground">
            Password reset links expire after a while for security. Request a new one from the sign-in screen.
          </p>
          <Button className="h-11 w-full rounded-lg" onClick={() => router.replace('/login')}>
            Back to sign in
          </Button>
        </motion.div>
      </div>
    );
  }

  if (status === 'done') {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="flex flex-col items-center gap-3 text-center"
        >
          <CheckCircle2 className="h-8 w-8 text-primary" />
          <p className="text-sm font-medium text-foreground">Password updated</p>
          <p className="text-sm text-muted-foreground">Taking you to your dashboard…</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <motion.form
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-6"
      >
        <div className="space-y-1.5 text-center sm:text-left">
          <h1 className="text-xl font-semibold">Set a new password</h1>
          <p className="text-sm text-muted-foreground">Choose a new password for your BullPen account.</p>
        </div>

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
          <Label htmlFor="new-password" className="text-sm font-medium">
            New password
          </Label>
          <PasswordInput
            id="new-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={status === 'submitting'}
            required
            autoComplete="new-password"
            autoFocus
            minLength={8}
            aria-invalid={!!error}
          />
          <p className="text-xs text-muted-foreground">Must be at least 8 characters</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirm-new-password" className="text-sm font-medium">
            Confirm password
          </Label>
          <PasswordInput
            id="confirm-new-password"
            placeholder="••••••••"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            disabled={status === 'submitting'}
            required
            autoComplete="new-password"
            aria-invalid={!!confirmPassword && password !== confirmPassword}
          />
          {confirmPassword && password !== confirmPassword && (
            <p className="text-xs text-destructive">Passwords do not match</p>
          )}
        </div>

        <Button
          type="submit"
          className="h-11 w-full rounded-lg"
          disabled={status === 'submitting' || !isValid}
        >
          {status === 'submitting' ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Updating...
            </>
          ) : (
            'Update password'
          )}
        </Button>
      </motion.form>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      }
    >
      <ResetPasswordContent />
    </Suspense>
  );
}
