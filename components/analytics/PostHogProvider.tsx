'use client';

import { Suspense, useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import type { PostHog } from 'posthog-js';
import { flushPendingEvents, loadPostHog, loadedPostHog } from '@/lib/analytics/track';
import { getStoredConsent, COOKIE_CONSENT_CHANGE_EVENT, type CookieConsentValue } from '@/lib/cookie-consent/storage';
import { aiSource } from '@/lib/analytics/ai-referrer';
import { useAuth } from '@/components/auth/AuthProvider';

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.posthog.com';

function currentUrl(pathname: string, search: string): string {
  return search ? `${pathname}?${search}` : pathname;
}

function initPostHog(posthog: PostHog) {
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
    //
    // This flag is the thing actually stopping replay: the PostHog project
    // had recording switched on server-side with no masking configured until
    // 2026-09-22, and one deleted line here would have started recording
    // every consenting session, login form included. Both halves are now off,
    // and the session_recording block below means that if replay is ever
    // turned on deliberately, it starts masked rather than starting open.
    disable_session_recording: true,
    session_recording: {
      // Never record what anyone types. Not a default worth inheriting.
      maskAllInputs: true,
      // Whole subtrees that are not to be recorded at all, marked in the
      // markup with ph-no-capture (the auth forms, today).
      blockSelector: ".ph-no-capture",
      // Request and response bodies stay out of replays even if the project
      // enables network capture.
      recordHeaders: false,
      recordBody: false,
    },
    disable_surveys: true,
  });

  // Tag the session with the AI assistant that sent it, so funnels and
  // pageviews can be filtered by it; first_ai_source stays on the person.
  // document.referrer keeps the original referrer across App Router navigations.
  const ai = aiSource(document.referrer, new URLSearchParams(window.location.search).get('utm_source'));
  if (ai) {
    posthog.register_for_session({ ai_source: ai });
    posthog.setPersonProperties(undefined, { first_ai_source: ai });
  }
}

/**
 * Ties the PostHog person to the account, so a visitor's pre-signup visits,
 * their signup and their later sessions are one person. Before this nothing
 * called identify, and retention could not be measured per account.
 * The account's UUID only: no email or name goes to PostHog. Signing out
 * resets, so a shared browser doesn't merge the next person into this one.
 * `undefined` = auth still loading; do nothing until it's known.
 */
function syncIdentity(posthog: PostHog, userId: string | null | undefined) {
  if (userId === undefined) return;
  if (userId) {
    if (posthog.get_distinct_id() !== userId) posthog.identify(userId);
  } else if (posthog._isIdentified()) {
    posthog.reset();
  }
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
  const { user, isLoading } = useAuth();
  const userId = isLoading ? undefined : (user?.id ?? null);
  const userIdRef = useRef(userId);

  // Before the consent effect, so start() below reads the current account.
  useEffect(() => {
    userIdRef.current = userId;
    const posthog = loadedPostHog();
    if (posthog) syncIdentity(posthog, userId);
  }, [userId]);

  // Route-change capture. Runs on every render where the URL changed; on the
  // very first render posthog isn't initialized yet (the consent effect
  // below runs after this one and handles that first pageview explicitly),
  // so this only fires for real navigations once already loaded.
  useEffect(() => {
    urlRef.current = currentUrl(pathname ?? '/', searchParams.toString());
    loadedPostHog()?.capture('$pageview', { $current_url: urlRef.current });
  }, [pathname, searchParams]);

  // Consent gating. Mount-once: checks existing consent and listens for the
  // banner's accept/reject event so this works whether consent was already
  // on file or the user accepts mid-session.
  useEffect(() => {
    if (!POSTHOG_KEY) return;

    // posthog-js is only downloaded here, once consent is on file (see
    // lib/analytics/track.ts): before 2026-10-21 every visitor paid for it.
    const start = () =>
      loadPostHog().then((posthog) => {
        const wasLoaded = posthog.__loaded;
        initPostHog(posthog);
        syncIdentity(posthog, userIdRef.current);
        if (!wasLoaded) posthog.capture('$pageview', { $current_url: urlRef.current });
        flushPendingEvents(posthog);
      });

    if (getStoredConsent() === 'accepted') void start();

    const onConsentChange = (e: Event) => {
      const value = (e as CustomEvent<CookieConsentValue>).detail;
      if (value === 'accepted') void start();
      else if (value === 'rejected') loadedPostHog()?.opt_out_capturing();
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
