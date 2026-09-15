'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, useReducedMotion } from 'framer-motion';
import { CheckCircle2, MailCheck, UserCheck } from 'lucide-react';
import { AuthOAuthButtons } from '@/components/auth/AuthOAuthButtons';
import { AuthFormSignup } from '@/components/auth/AuthFormSignup';
import { resendSignupConfirmation, signInIfConfirmed, signInWithGoogle } from '@/lib/auth/auth';
import { AWAITING_CONFIRMATION_KEY } from '@/lib/onboarding/pending-onboarding';
import { trackEvent } from '@/lib/analytics/track';

const TRIAL_PATH = '/get-started/trial';
const CONFIRMED_TRIAL_PATH = '/get-started/trial?confirmed=1';
const SIGN_IN_HREF = `/login?redirect=${encodeURIComponent(TRIAL_PATH)}`;

/**
 * The signup form at the bottom of the preview screen. Composition mirrors
 * app/register/page.tsx (AuthFormSignup renders fine standalone, outside a
 * Dialog), relabeled to frame this as creating their BullPen.
 */
export function GetStartedSignupForm() {
  const router = useRouter();
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [error, setError] = useState('');
  const [waitingFor, setWaitingFor] = useState<{ email: string; password: string } | null>(null);
  const [inUse, setInUse] = useState<string | null>(null);

  const handleSuccess = () => {
    // Only reachable for the email path when no confirmation is needed. A
    // successful Google sign-in never returns to this component (full-page
    // OAuth redirect).
    trackEvent('get_started_completed', {});
    router.replace(TRIAL_PATH);
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setIsGoogleLoading(true);
    trackEvent('signup_form_submitted', { source: 'get_started', method: 'google' });
    try {
      const result = await signInWithGoogle(TRIAL_PATH);
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

  if (waitingFor) {
    return (
      <ConfirmEmailWait
        email={waitingFor.email}
        password={waitingFor.password}
        onUseDifferent={() => {
          try { sessionStorage.removeItem(AWAITING_CONFIRMATION_KEY); } catch { /* ignore */ }
          setWaitingFor(null);
        }}
      />
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
        onConfirmationRequired={(email, password) => setWaitingFor({ email, password })}
        onEmailInUse={(email) => { setError(''); setInUse(email); }}
        submitLabel="Create my BullPen"
        submitLoadingLabel="Creating..."
        submitClassName="btn btn-primary"
        source="get_started"
        emailRedirectPath={CONFIRMED_TRIAL_PATH}
      />

      <p style={{ marginTop: 16, fontSize: 13, color: 'var(--fg-dim)', textAlign: 'center' }}>
        Already have an account?{' '}
        <Link href={SIGN_IN_HREF} style={{ color: 'var(--fg)', fontWeight: 600 }}>Sign in</Link>
      </p>
    </div>
  );
}

/**
 * Waits on the page for the confirmation link to be clicked, on this device or
 * another one, then signs this tab in. Signing in is all it takes to move on:
 * GetStartedPage redirects every signed-in visitor to the trial offer.
 *
 * The password stays in memory for as long as this screen is open, never in
 * storage. Supabase rate-limits sign-in attempts per IP, so the timer is gentle
 * and a check also runs the moment the tab regains focus, which is when most
 * people come back from their inbox.
 */
function ConfirmEmailWait({
  email,
  password,
  onUseDifferent,
}: {
  email: string;
  password: string;
  onUseDifferent: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const [status, setStatus] = useState<'waiting' | 'confirmed' | 'failed'>('waiting');
  const [resend, setResend] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  useEffect(() => {
    try { sessionStorage.setItem(AWAITING_CONFIRMATION_KEY, '1'); } catch { /* ignore */ }

    const startedAt = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let checking = false;
    let stopped = false;
    let slowUntil = 0;

    const schedule = () => {
      const elapsed = Date.now() - startedAt;
      const base = elapsed < 2 * 60_000 ? 6_000 : elapsed < 15 * 60_000 ? 20_000 : 60_000;
      timer = setTimeout(check, Math.max(base, slowUntil - Date.now()));
    };

    const check = async () => {
      if (stopped || checking) return;
      clearTimeout(timer);
      if (Date.now() < slowUntil) { schedule(); return; }
      checking = true;
      const result = await signInIfConfirmed(email, password);
      checking = false;
      if (stopped) return;
      if (result === 'confirmed') {
        stopped = true;
        trackEvent('signup_email_confirmed_on_wait_screen', {});
        setStatus('confirmed');
        return;
      }
      if (result === 'failed') {
        stopped = true;
        setStatus('failed');
        return;
      }
      if (result === 'slow_down') slowUntil = Date.now() + 60_000;
      schedule();
    };

    const onReturn = () => {
      if (document.visibilityState === 'visible') void check();
    };

    schedule();
    window.addEventListener('focus', onReturn);
    document.addEventListener('visibilitychange', onReturn);
    return () => {
      stopped = true;
      clearTimeout(timer);
      window.removeEventListener('focus', onReturn);
      document.removeEventListener('visibilitychange', onReturn);
    };
  }, [email, password]);

  const handleResend = async () => {
    setResend('sending');
    setResend((await resendSignupConfirmation(email, CONFIRMED_TRIAL_PATH)) ? 'sent' : 'error');
  };

  const confirmed = status === 'confirmed';
  const Icon = confirmed ? CheckCircle2 : MailCheck;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        marginTop: 32, padding: '28px 20px', borderRadius: 18, textAlign: 'center',
        border: `1px solid ${confirmed ? 'var(--accent)' : 'var(--border)'}`, background: 'var(--surface)',
        transition: 'border-color 240ms cubic-bezier(0.22,1,0.36,1)',
      }}
    >
      <span
        aria-hidden
        style={{
          display: 'grid', placeItems: 'center', width: 48, height: 48, margin: '0 auto 16px',
          borderRadius: 999, background: 'var(--accent-soft)', color: 'var(--accent)',
        }}
      >
        <Icon size={22} />
      </span>

      <h2 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 700, color: 'var(--fg)' }}>
        {confirmed ? 'All set!' : 'Confirm your email'}
      </h2>

      {confirmed ? (
        <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: 'var(--fg-muted)' }}>
          Taking you to your free week of Pro.
        </p>
      ) : (
        <>
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: 'var(--fg-muted)', textWrap: 'pretty' }}>
            We sent a link to <strong style={{ color: 'var(--fg)', fontWeight: 600 }}>{email}</strong>. Open it on any
            device and this page continues on its own.
          </p>

          {status === 'waiting' && (
            <p style={{ display: 'inline-flex', alignItems: 'center', gap: 8, margin: '16px 0 0', fontSize: 13, color: 'var(--fg-dim)' }}>
              <motion.span
                aria-hidden
                style={{ width: 8, height: 8, borderRadius: 999, background: 'var(--accent)' }}
                animate={reduceMotion ? undefined : { opacity: [1, 0.3, 1] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
              />
              Waiting for confirmation
            </p>
          )}

          {status === 'failed' && (
            <p style={{ margin: '16px 0 0', fontSize: 14, color: 'var(--fg-muted)' }}>
              Already confirmed?{' '}
              <Link href={SIGN_IN_HREF} style={{ color: 'var(--fg)', fontWeight: 600 }}>Sign in to continue</Link>
            </p>
          )}

          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 20 }}>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={handleResend}
              disabled={resend === 'sending' || resend === 'sent'}
            >
              {resend === 'sending' ? 'Sending...' : resend === 'sent' ? 'Sent. Check spam too' : 'Resend email'}
            </button>
            <button
              type="button"
              onClick={onUseDifferent}
              style={{
                padding: '8px 12px', fontSize: 14, color: 'var(--fg-dim)',
                background: 'transparent', border: 'none', cursor: 'pointer', textDecoration: 'underline',
              }}
            >
              Use a different email
            </button>
          </div>
          {resend === 'error' && (
            <p role="alert" style={{ margin: '12px 0 0', fontSize: 13, color: 'var(--fg-muted)' }}>
              Couldn&apos;t resend just now. Try again in a minute.
            </p>
          )}
        </>
      )}
    </div>
  );
}
