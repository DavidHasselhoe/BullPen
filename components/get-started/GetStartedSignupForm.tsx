'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MailCheck, UserCheck } from 'lucide-react';
import { AuthOAuthButtons } from '@/components/auth/AuthOAuthButtons';
import { AuthFormSignup } from '@/components/auth/AuthFormSignup';
import { signInWithGoogle } from '@/lib/auth/auth';
import { trackEvent } from '@/lib/analytics/track';

const SIGN_IN_HREF = `/login?redirect=${encodeURIComponent('/get-started/trial')}`;

/**
 * The signup form at the bottom of the preview screen. Composition mirrors
 * app/register/page.tsx (AuthFormSignup renders fine standalone, outside a
 * Dialog), relabeled to frame this as creating their BullPen.
 */
export function GetStartedSignupForm() {
  const router = useRouter();
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [error, setError] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [inUse, setInUse] = useState<string | null>(null);

  const handleSuccess = () => {
    // Only reachable for the email path when no confirmation is needed. A
    // successful Google sign-in never returns to this component (full-page
    // OAuth redirect).
    trackEvent('get_started_completed', {});
    router.replace('/get-started/trial');
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setIsGoogleLoading(true);
    trackEvent('signup_form_submitted', { source: 'get_started', method: 'google' });
    try {
      const result = await signInWithGoogle('/get-started/trial');
      if (!result.success) {
        setError(result.error || 'Failed to sign in with Google');
        setIsGoogleLoading(false);
        trackEvent('signup_form_failed', { source: 'get_started', method: 'google' });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
      setIsGoogleLoading(false);
      trackEvent('signup_form_failed', { source: 'get_started', method: 'google' });
    }
  };

  if (sentTo) {
    return (
      <div
        role="status"
        style={{
          marginTop: 32, padding: '28px 20px', borderRadius: 18, textAlign: 'center',
          border: '1px solid var(--border)', background: 'var(--surface)',
        }}
      >
        <span
          aria-hidden
          style={{
            display: 'grid', placeItems: 'center', width: 48, height: 48, margin: '0 auto 16px',
            borderRadius: 999, background: 'var(--accent-soft)', color: 'var(--accent)',
          }}
        >
          <MailCheck size={22} />
        </span>
        <h2 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 700, color: 'var(--fg)' }}>Check your inbox</h2>
        <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: 'var(--fg-muted)', textWrap: 'pretty' }}>
          We sent a confirmation link to <strong style={{ color: 'var(--fg)', fontWeight: 600 }}>{sentTo}</strong>.
          Open it on this device to finish. It can take a minute, so check spam too.
        </p>
        <button
          type="button"
          onClick={() => setSentTo(null)}
          style={{
            marginTop: 16, padding: '8px 12px', fontSize: 14, color: 'var(--fg-dim)',
            background: 'transparent', border: 'none', cursor: 'pointer', textDecoration: 'underline',
          }}
        >
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 40 }}>
      <h2 style={{ margin: '0 0 16px', textAlign: 'center', fontSize: 19, fontWeight: 600, color: 'var(--fg)' }}>
        Save it to a free account
      </h2>

      {inUse && (
        <div
          role="alert"
          style={{
            display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, padding: '12px 14px', borderRadius: 14,
            border: '1px solid var(--border-strong)', background: 'var(--surface)',
          }}
        >
          <UserCheck size={18} aria-hidden style={{ flexShrink: 0, color: 'var(--fg-muted)' }} />
          <p style={{ flex: 1, minWidth: 0, margin: 0, fontSize: 14, lineHeight: 1.5, color: 'var(--fg)' }}>
            <strong style={{ fontWeight: 600 }}>{inUse}</strong> already has an account.
          </p>
          <Link href={SIGN_IN_HREF} className="btn btn-primary" style={{ flexShrink: 0, padding: '8px 14px', fontSize: 14 }}>
            Sign in
          </Link>
        </div>
      )}

      {error && (
        <div
          role="alert"
          style={{
            marginBottom: 16, padding: '10px 14px', borderRadius: 10, fontSize: 14,
            border: '1px solid oklch(from var(--down) l c h / 0.4)',
            background: 'oklch(from var(--down) l c h / 0.1)', color: 'var(--down)',
          }}
        >
          {error}
        </div>
      )}

      <AuthOAuthButtons onGoogleClick={handleGoogleSignIn} isLoading={isGoogleLoading} disabled={false} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0', fontSize: 13, color: 'var(--fg-dim)' }}>
        <span aria-hidden style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        or with email
        <span aria-hidden style={{ flex: 1, height: 1, background: 'var(--border)' }} />
      </div>

      <AuthFormSignup
        onSuccess={handleSuccess}
        onError={(msg) => { setInUse(null); setError(msg); }}
        onConfirmationRequired={setSentTo}
        onEmailInUse={(email) => { setError(''); setInUse(email); }}
        submitLabel="Create my BullPen"
        submitLoadingLabel="Creating..."
        submitClassName="btn btn-primary"
        source="get_started"
        emailRedirectPath="/get-started/trial"
      />

      <p style={{ marginTop: 16, fontSize: 13, color: 'var(--fg-dim)', textAlign: 'center' }}>
        Already have an account?{' '}
        <Link href={SIGN_IN_HREF} style={{ color: 'var(--fg)', fontWeight: 600 }}>Sign in</Link>
      </p>
    </div>
  );
}
