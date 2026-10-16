'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { setupOr, signInWithGoogle } from '@/lib/auth/auth';
import { AuthOAuthButtons } from '@/components/auth/AuthOAuthButtons';
import { AuthFormSignup } from '@/components/auth/AuthFormSignup';
import { Separator } from '@/components/ui/separator';
import { motion } from 'framer-motion';
import { trackEvent } from '@/lib/analytics/track';
import { useAuth } from '@/hooks/use-auth';

function RegisterContent() {
  const { t } = useTranslation('auth');
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  // Google only: the email form shows its own errors, once, next to the field.
  const [error, setError] = useState('');

  // Honor ?redirect so post-signup we can land users on checkout (/upgrade),
  // not always the dashboard.
  const redirectTo = searchParams.get('redirect') || '/dashboard';
  const signInHref =
    redirectTo !== '/dashboard' ? `/login?redirect=${encodeURIComponent(redirectTo)}` : '/login';

  // Already signed in when the page opened: there is no second account to
  // make, so go where they were headed. Only that first check: a signup here
  // must still reach handleSuccess, which sends a new account through setup.
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const checkedSignedIn = useRef(false);
  useEffect(() => {
    if (authLoading || checkedSignedIn.current) return;
    checkedSignedIn.current = true;
    if (isAuthenticated) router.replace(redirectTo);
  }, [authLoading, isAuthenticated, redirectTo, router]);

  const handleGoogleSignIn = async () => {
    setError('');
    setIsGoogleLoading(true);
    trackEvent('signup_form_submitted', { source: 'register', method: 'google' });

    try {
      const result = await signInWithGoogle(redirectTo !== '/dashboard' ? redirectTo : undefined);
      if (!result.success) {
        setError(t('modalGoogleFailed'));
        setIsGoogleLoading(false);
        trackEvent('signup_form_failed', { source: 'register', method: 'google' });
      }
      // If successful, redirect will happen automatically via OAuth flow
    } catch {
      setError(t('modalGoogleFailed'));
      setIsGoogleLoading(false);
      trackEvent('signup_form_failed', { source: 'register', method: 'google' });
    }
  };

  const handleSuccess = async () => {
    // A new account goes through setup unless a real destination was asked for.
    router.replace(await setupOr(redirectTo));
  };

  return (
    // max-md:pb-56: room to scroll the form clear of the cookie banner, which
    // sits above the (absent here) tab bar on phones and covered the button.
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden p-4 max-md:pb-56">
      {/* Atmospheric glow */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[480px]"
        style={{
          background: 'radial-gradient(ellipse 60% 40% at 50% -10%, oklch(0.45 0.12 162 / 0.18) 0%, transparent 70%)',
        }}
      />
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-full max-w-md space-y-6"
      >
        {/* Wordmark */}
        <div className="text-center">
          <Link href="/" className="inline-block text-[22px] font-semibold tracking-tight text-foreground/90 hover:text-foreground transition-colors duration-150">
            bullpen
          </Link>
        </div>

        {/* Header */}
        <div className="space-y-1.5 text-center">
          <h1 className="text-xl font-semibold">{t('modalTitleSignup')}</h1>
          <p className="text-sm text-muted-foreground">{t('modalDescriptionSignup')}</p>
        </div>

        {/* OAuth Buttons - First class */}
        <AuthOAuthButtons
          onGoogleClick={handleGoogleSignIn}
          isLoading={isGoogleLoading}
          disabled={false}
        />

        {error && (
          <div
            className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
            role="alert"
          >
            {error}
          </div>
        )}

        {/* Divider */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <Separator />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">{t('modalOrContinueWithEmail')}</span>
          </div>
        </div>

        {/* Signup Form */}
        {/* The confirmation link lands where the person was headed, like Google
            does; it always went to /dashboard, dropping every ?redirect. */}
        <AuthFormSignup
          onSuccess={handleSuccess}
          source="register"
          emailRedirectPath={redirectTo !== '/dashboard' ? redirectTo : undefined}
        />

        {/* Footer */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2, delay: 0.1 }}
          className="text-center"
        >
          <p className="text-sm text-muted-foreground">
            {t('modalHasAccount')}{' '}
            <a
              href={signInHref}
              className="font-medium text-primary underline-offset-4 hover:underline transition-colors"
            >
              {t('loginSubmit')}
            </a>
          </p>
        </motion.div>
      </motion.div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterContent />
    </Suspense>
  );
}
