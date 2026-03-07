'use client';

/**
 * OAuth Callback Page (PKCE flow)
 *
 * Supabase redirects here after Google (or any provider) login with a ?code=
 * query param. With detectSessionInUrl: true, the Supabase client automatically
 * exchanges the code for a session. We listen for SIGNED_IN and redirect.
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
      setTimeout(() => router.replace(`/login?error=${encodeURIComponent(msg)}`), 1500);
      return;
    }

    const supabase = createBrowserClient();
    let redirected = false;

    // Full page reload ensures useAuth re-initializes with session from localStorage.
    // Client-side router.replace kept showing logged-out until tab close/reopen.
    const goHome = () => {
      if (!redirected) {
        redirected = true;
        // Brief delay ensures session is fully persisted before full-page reload
        setTimeout(() => window.location.replace('/'), 150);
      }
    };

    const checkSession = () =>
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) goHome();
        return !!session;
      });

    // Event may fire before we register (client created in layout). Poll as fallback.
    const POLL_MS = 200;
    const POLL_MAX_MS = 15_000;
    let elapsed = 0;
    const pollId = setInterval(async () => {
      if (redirected) return;
      const hasSession = await checkSession();
      if (hasSession) {
        clearInterval(pollId);
        return;
      }
      elapsed += POLL_MS;
      if (elapsed >= POLL_MAX_MS) clearInterval(pollId);
    }, POLL_MS);

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session) goHome();
    });

    checkSession();

    return () => {
      clearInterval(pollId);
      subscription.unsubscribe();
    };
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
