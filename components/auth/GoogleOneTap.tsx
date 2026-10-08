'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import Script from 'next/script';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { createBrowserClient } from '@/lib/supabase/client';
import { needsSetup } from '@/lib/auth/auth';
import { maybeClaimShareAttribution } from '@/lib/auth/share-attribution';
import { setLastUsedAuthMethod } from '@/lib/auth/last-used-method';
import { COOKIE_CONSENT_CHANGE_EVENT, getStoredConsent } from '@/lib/cookie-consent/storage';
import { trackEvent } from '@/lib/analytics/track';

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

/** Pages with their own sign-up flow. /get-started stages choices before the
 *  account exists, so signing in around it would drop them. */
const SKIP = /^\/(login|register|auth|get-started|reset-password|forgot-password)(\/|$)/;

interface GoogleId {
  initialize(config: Record<string, unknown>): void;
  prompt(): void;
  cancel(): void;
}
declare global {
  interface Window { google?: { accounts: { id: GoogleId } } }
}

function subscribeConsent(onChange: () => void) {
  window.addEventListener(COOKIE_CONSENT_CHANGE_EVENT, onChange);
  return () => window.removeEventListener(COOKIE_CONSENT_CHANGE_EVENT, onChange);
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Google One Tap: a signed-out visitor already signed in to Google gets the
 * "Continue as <name>" prompt and is in with one click, no redirect. Google
 * runs the cooldown after a dismissal itself.
 *
 * Off until NEXT_PUBLIC_GOOGLE_CLIENT_ID is set, and only after cookie
 * consent: the prompt loads a Google script that reads the visitor's Google
 * session before they have asked for anything.
 *
 * The id token goes to Supabase with a nonce (Google gets the hash, Supabase
 * the raw value), so a token lifted from another site can't be replayed here.
 * New accounts still meet AgeCheckGate, same as the Google redirect flow.
 */
export function GoogleOneTap() {
  const { isAuthenticated, isLoading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const consented = useSyncExternalStore(subscribeConsent, () => getStoredConsent() === 'accepted', () => false);
  const [loaded, setLoaded] = useState(false);

  const eligible = !!CLIENT_ID && consented && !isLoading && !isAuthenticated && !SKIP.test(pathname);

  useEffect(() => {
    const id = window.google?.accounts.id;
    if (!eligible || !loaded || !id) return;
    let cancelled = false;
    const raw = crypto.randomUUID();

    void sha256Hex(raw).then((hashed) => {
      if (cancelled) return;
      id.initialize({
        client_id: CLIENT_ID,
        nonce: hashed,
        use_fedcm_for_prompt: true,
        itp_support: true,
        context: 'signin',
        callback: async ({ credential }: { credential: string }) => {
          const { data, error } = await createBrowserClient().auth.signInWithIdToken({ provider: 'google', token: credential, nonce: raw });
          if (error || !data.user) {
            trackEvent('one_tap_failed', { reason: error?.message ?? 'no_user' });
            return;
          }
          const isNew = Date.now() - Date.parse(data.user.created_at) < 60_000;
          const path = window.location.pathname;
          trackEvent('one_tap_signed_in', { isNew, path });
          setLastUsedAuthMethod('google');
          void maybeClaimShareAttribution();
          // Same rule as /auth/callback: the landing page is a default
          // destination and gives way to setup; any other page is where they
          // were reading, so they stay on it.
          if (path === '/') {
            const setup = await needsSetup(data.user.id).catch(() => false);
            router.replace(setup ? '/get-started?setup=1' : '/dashboard');
          }
        },
      });
      id.prompt();
    });

    return () => {
      cancelled = true;
      id.cancel();
    };
  }, [eligible, loaded, router]);

  if (!CLIENT_ID || !consented || isAuthenticated) return null;
  return <Script src="https://accounts.google.com/gsi/client" strategy="lazyOnload" onReady={() => setLoaded(true)} />;
}
