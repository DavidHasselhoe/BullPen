'use client';

/**
 * OAuth Callback Page (PKCE flow)
 *
 * Supabase redirects here after Google (or any provider) login with a ?code=
 * query param. We await exchangeCodeForSession() so the session is persisted.
 * AuthProvider receives SIGNED_IN via onAuthStateChange and updates state.
 * We use router.replace() — no full reload needed.
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
    const code = searchParams.get('code');

    if (error) {
      const msg = errorDescription || error;
      setAuthError(msg);
      setTimeout(() => router.replace(`/login?error=${encodeURIComponent(msg)}`), 1500);
      return;
    }

    const supabase = createBrowserClient();
    let redirected = false;
    const DEBUG = false; // Set true to log callback flow

    const redirectHome = () => {
      if (!redirected) {
        redirected = true;
        router.replace('/');
      }
    };

    const runExchange = async () => {
      if (redirected || !code) return;
      if (DEBUG) console.log('[Auth Callback] exchanging code...');

      const { data, error: exErr } = await supabase.auth.exchangeCodeForSession(code);

      if (DEBUG) console.log('[Auth Callback] exchange result', exErr ? exErr.message : 'ok');
      if (exErr) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) redirectHome();
        return;
      }

      if (data.session) redirectHome();
    };

    const checkSession = () =>
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) redirectHome();
        return !!session;
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session) redirectHome();
    });

    if (code) {
      void runExchange();
    } else {
      checkSession();
    }

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
