'use client';

import { Suspense, useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import posthog from 'posthog-js';
import { getStoredConsent, COOKIE_CONSENT_CHANGE_EVENT, type CookieConsentValue } from '@/lib/cookie-consent/storage';

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.posthog.com';

function currentUrl(pathname: string, search: string): string {
  return search ? `${pathname}?${search}` : pathname;
}

function initPostHog() {
  if (!POSTHOG_KEY || posthog.__loaded) return;
  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    // Pageviews are captured manually below — App Router navigations don't
    // fire a browser page load, so posthog-js's built-in capture_pageview
    // would only ever see the very first page.
    capture_pageview: false,
    person_profiles: 'always',
    // The consent banner promises "optional analytics", not session replay —
    // keep the footprint to pageviews/clicks (autocapture) until that's a
    // deliberate, separately-consented decision.
    disable_session_recording: true,
    disable_surveys: true,
  });
}

/** Fires a $pageview on every App Router navigation, including the initial
 * load — tagged with whatever UTM params PostHog auto-attaches. That's what
 * lets a funnel be broken down by utm_content (e.g. an Instagram post's
 * period key) to see which post actually converted, not just which one got
 * taps. */
function PostHogInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlRef = useRef(currentUrl(pathname ?? '/', searchParams.toString()));

  // Route-change capture. Runs on every render where the URL changed; on the
  // very first render posthog isn't initialized yet (the consent effect
  // below runs after this one and handles that first pageview explicitly),
  // so this only fires for real navigations once already loaded.
  useEffect(() => {
    urlRef.current = currentUrl(pathname ?? '/', searchParams.toString());
    if (posthog.__loaded) posthog.capture('$pageview', { $current_url: urlRef.current });
  }, [pathname, searchParams]);

  // Consent gating. Mount-once: checks existing consent and listens for the
  // banner's accept/reject event so this works whether consent was already
  // on file or the user accepts mid-session.
  useEffect(() => {
    if (!POSTHOG_KEY) return;

    const captureCurrent = () => posthog.capture('$pageview', { $current_url: urlRef.current });

    if (getStoredConsent() === 'accepted') {
      initPostHog();
      captureCurrent();
    }

    const onConsentChange = (e: Event) => {
      const value = (e as CustomEvent<CookieConsentValue>).detail;
      if (value === 'accepted') {
        const wasLoaded = posthog.__loaded;
        initPostHog();
        if (!wasLoaded) captureCurrent();
      } else if (value === 'rejected' && posthog.__loaded) {
        posthog.opt_out_capturing();
      }
    };

    window.addEventListener(COOKIE_CONSENT_CHANGE_EVENT, onConsentChange);
    return () => window.removeEventListener(COOKIE_CONSENT_CHANGE_EVENT, onConsentChange);
  }, []);

  return null;
}

export function PostHogProvider() {
  if (!POSTHOG_KEY) return null;

  return (
    <Suspense fallback={null}>
      <PostHogInner />
    </Suspense>
  );
}
