'use client';

/**
 * OAuth Callback Page (PKCE flow)
 *
 * Supabase redirects here after Google (or any provider) login with a ?code=
 * query param. We explicitly call exchangeCodeForSession(code) to exchange it
 * immediately for a session (using the PKCE verifier in sessionStorage), then
 * redirect to / so the URL has no hash or stale params.
 */

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createBrowserClient } from '@/lib/supabase/client';
import { Loader2 } from 'lucide-react';

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    if (error) {
      const msg = errorDescription || error;
      setAuthError(msg);
      setTimeout(() => {
        router.replace(`/login?error=${encodeURIComponent(msg)}`);
      }, 1500);
      return;
    }

    const supabase = createBrowserClient();
    const code = searchParams.get('code');
    let redirected = false;

    const goHome = () => {
      if (!redirected) {
        redirected = true;
        router.replace('/');
      }
    };

    const handleError = (msg: string) => {
      setAuthError(msg);
      setTimeout(() => router.replace(`/login?error=${encodeURIComponent(msg)}`), 1500);
    };

    const MAX_RETRIES = 3;
    const doExchange = (retryCount = 0) => {
      if (!code) return;
      supabase.auth
        .exchangeCodeForSession(code)
        .then(({ error: exchangeError }) => {
          if (exchangeError) {
            const msg = exchangeError.message;
            const isAbort = /abort|signal/i.test(msg);
            if (isAbort && retryCount < MAX_RETRIES) {
              setTimeout(() => doExchange(retryCount + 1), 250 * (retryCount + 1));
              return;
            }
            handleError(msg);
            return;
          }
          goHome();
        })
        .catch((err) => {
          const msg = err?.message ?? 'Sign-in failed';
          const isAbort = /abort|signal/i.test(msg);
          if (isAbort && retryCount < MAX_RETRIES) {
            setTimeout(() => doExchange(retryCount + 1), 250 * (retryCount + 1));
            return;
          }
          handleError(msg);
        });
    };

    if (code) {
      doExchange();
      return;
    }

    // Fallback if no code (shouldn't happen in normal flow): wait for session.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session) goHome();
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) goHome();
    });
    return () => subscription.unsubscribe();
  }, [router, searchParams]);

  if (authError) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-destructive">Authentication failed: {authError}</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Completing sign in…</p>
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      }
    >
      <AuthCallbackContent />
    </Suspense>
  );
}
