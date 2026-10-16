'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { signInWithGoogle } from '@/lib/auth/auth';
import { getLastUsedAuthMethod } from '@/lib/auth/last-used-method';
import { AuthOAuthButtons } from '@/components/auth/AuthOAuthButtons';
import { AuthFormLogin } from '@/components/auth/AuthFormLogin';
import { AuthFormForgotPassword } from '@/components/auth/AuthFormForgotPassword';
import { Separator } from '@/components/ui/separator';
import { motion } from 'framer-motion';
import { trackEvent } from '@/lib/analytics/track';
import { useAuth } from '@/hooks/use-auth';

function LoginContent() {
  const { t } = useTranslation('auth');
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  // Google only: the email form shows its own errors, once, inside the form.
  const [error, setError] = useState('');
  const [lastUsedGoogle, setLastUsedGoogle] = useState(false);
  // The reset form opens in place. This page had no way to reset a password;
  // only the sign-in modal passed onForgotPassword.
  const [mode, setMode] = useState<'login' | 'forgot'>('login');

  const redirectTo = searchParams.get('redirect') || '/';

  // Read on mount only (not SSR-safe to read synchronously — localStorage
  // doesn't exist on the server, so this must happen post-hydration).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: sync external localStorage into state on mount
    setLastUsedGoogle(getLastUsedAuthMethod() === 'google');
  }, []);

  // Already signed in when the page opened: go where they were headed. Only
  // that first check, so signing in here still runs handleSuccess.
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
    trackEvent('login_form_submitted', { source: 'login', method: 'google' });

    try {
      const result = await signInWithGoogle(redirectTo !== '/' ? redirectTo : undefined);
      if (!result.success) {
        setError(t('modalGoogleFailed'));
        setIsGoogleLoading(false);
        trackEvent('login_form_failed', { source: 'login', method: 'google' });
      }
    } catch {
      setError(t('modalGoogleFailed'));
      setIsGoogleLoading(false);
      trackEvent('login_form_failed', { source: 'login', method: 'google' });
    }
  };

  const handleSuccess = () => {
    router.replace(redirectTo);
  };

  const forgot = mode === 'forgot';

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

        <div className="space-y-1.5 text-center">
          <h1 className="text-xl font-semibold">{forgot ? t('modalTitleForgotPassword') : t('modalTitleLogin')}</h1>
          <p className="text-sm text-muted-foreground">
            {forgot ? t('modalDescriptionForgotPassword') : t('modalDescriptionLogin')}
          </p>
        </div>

        {forgot ? (
          <AuthFormForgotPassword onBack={() => setMode('login')} />
        ) : (
          <>
            <AuthOAuthButtons
              onGoogleClick={handleGoogleSignIn}
              isLoading={isGoogleLoading}
              disabled={false}
              lastUsed={lastUsedGoogle}
            />

            {error && (
              <div
                className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
                role="alert"
              >
                {error}
              </div>
            )}

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <Separator />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">{t('modalOrContinueWithEmail')}</span>
              </div>
            </div>

            <AuthFormLogin
              onSuccess={handleSuccess}
              onForgotPassword={() => {
                setError('');
                setMode('forgot');
              }}
              redirectTo={redirectTo}
              source="login"
            />

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2, delay: 0.1 }}
              className="text-center"
            >
              <p className="text-sm text-muted-foreground">
                {t('modalNoAccount')}{' '}
                <a
                  href={redirectTo !== '/' ? `/register?redirect=${encodeURIComponent(redirectTo)}` : '/register'}
                  className="font-medium text-primary underline-offset-4 hover:underline transition-colors"
                >
                  {t('modalSignUp')}
                </a>
              </p>
            </motion.div>
          </>
        )}
      </motion.div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}
