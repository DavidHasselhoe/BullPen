'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Separator } from '@/components/ui/separator';
import { AuthOAuthButtons } from '@/components/auth/AuthOAuthButtons';
import { AuthFormSignup } from '@/components/auth/AuthFormSignup';
import { signInWithGoogle } from '@/lib/auth/auth';
import { trackEvent } from '@/lib/analytics/track';

/**
 * The signup form embedded at the bottom of the reveal screen. Composition
 * mirrors app/register/page.tsx (AuthFormSignup already renders fine
 * standalone, outside a Dialog) — just relabeled to frame this as "saving"
 * the profile the user just built, not "creating an account".
 */
export function GetStartedSignupForm() {
  const router = useRouter();
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSuccess = () => {
    // Only reachable for the email path — a successful Google sign-in below
    // never returns to this component (full-page OAuth redirect), so it has
    // no success event of its own. That's still visible in PostHog as the
    // automatic $pageview for /dashboard shortly after signup_form_submitted
    // with method "google" and no matching signup_form_failed.
    trackEvent('get_started_completed', {});
    router.replace('/dashboard');
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setIsGoogleLoading(true);
    trackEvent('signup_form_submitted', { source: 'get_started', method: 'google' });
    try {
      const result = await signInWithGoogle();
      if (!result.success) {
        setError(result.error || 'Failed to sign in with Google');
        setIsGoogleLoading(false);
        trackEvent('signup_form_failed', { source: 'get_started', method: 'google' });
      }
      // On success, the OAuth redirect takes over from here — see handleSuccess's comment.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
      setIsGoogleLoading(false);
      trackEvent('signup_form_failed', { source: 'get_started', method: 'google' });
    }
  };

  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border-strong)',
        borderRadius: 20,
        padding: 'clamp(20px, 4vw, 32px)',
        marginTop: 32,
      }}
    >
      {error && (
        <div
          role="alert"
          style={{
            marginBottom: 16,
            padding: '10px 14px',
            borderRadius: 10,
            border: '1px solid oklch(from var(--down) l c h / 0.4)',
            background: 'oklch(from var(--down) l c h / 0.1)',
            color: 'var(--down)',
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      <AuthOAuthButtons onGoogleClick={handleGoogleSignIn} isLoading={isGoogleLoading} disabled={false} />

      <div style={{ position: 'relative', margin: '20px 0' }}>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center' }}>
          <Separator />
        </div>
        <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', fontSize: 11, textTransform: 'uppercase' }}>
          <span style={{ background: 'var(--surface)', padding: '0 10px', color: 'var(--fg-dim)' }}>
            Or continue with email
          </span>
        </div>
      </div>

      <AuthFormSignup
        onSuccess={handleSuccess}
        onError={setError}
        submitLabel="Save my profile"
        submitLoadingLabel="Saving..."
        submitClassName="btn-brand-solid"
        source="get_started"
      />

      <p style={{ marginTop: 16, fontSize: 12, color: 'var(--fg-dim)', textAlign: 'center' }}>
        You can change any of this anytime in Settings.
      </p>
    </div>
  );
}
