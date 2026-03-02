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

    const goHome = () => {
      if (!redirected) {
        redirected = true;
        router.replace('/');
      }
    };

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
