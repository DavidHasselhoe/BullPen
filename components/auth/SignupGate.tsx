'use client';

import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { AuthMode } from '@/components/auth/AuthModal';
import { useAuth } from '@/hooks/use-auth';
import { trackEvent } from '@/lib/analytics/track';

const AuthModal = lazy(() => import('@/components/auth/AuthModal').then((m) => ({ default: m.AuthModal })));

export interface SignupGateRequest {
  /** What the account gets them, for the thing they just tried: "Create a free account to keep AAPL on your watchlist." */
  context?: string;
  /** Which gate, for signup_gate_shown and the signup_form_* events (source "gate_<this>"). */
  source: string;
  /** 'login' for an explicit "Sign in" choice; signup otherwise, since most guests at a gate are new. */
  mode?: Extract<AuthMode, 'signup' | 'login'>;
  /** Where to land after signing in. Defaults to this page, query included. */
  redirectTo?: string;
  /** The action to finish once they're in, as "<kind>:<value>" ("watch:AAPL"). See useResumeAction. */
  resume?: string;
}

const RESUME_PARAM = 'resume';

const SignupGateContext = createContext<(request: SignupGateRequest) => void>(() => {});
const ResumeContext = createContext<{ pending: string | null; consume: () => void }>({ pending: null, consume: () => {} });

/** The action carried back on the URL by Google's redirect or the confirmation link. */
function resumeFromUrl(): string | null {
  return typeof window === 'undefined' ? null : new URL(window.location.href).searchParams.get(RESUME_PARAM);
}

/**
 * The one way a guest is asked for an account inside the app: the sign-up
 * dialog over the page they are on, opened at the moment they try something,
 * with a line saying what that thing needs the account for. Google first,
 * email below, "Sign in" one tab away. They never leave the page, and every
 * route back (in place, Google, the email confirmation link) returns here and
 * finishes what they were doing.
 */
export function SignupGateProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<(SignupGateRequest & { redirectTo: string }) | null>(null);
  // Read once, here, as the app starts: a page that rewrites its own URL (the
  // screener syncs its filters) or a control that mounts after its data loads
  // could otherwise never see it. Held until a control claims it.
  const [pending, setPending] = useState<string | null>(resumeFromUrl);
  const consume = useCallback(() => setPending(null), []);
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(RESUME_PARAM)) return;
    url.searchParams.delete(RESUME_PARAM);
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
  }, []);

  const open = useCallback((r: SignupGateRequest) => {
    trackEvent('signup_gate_shown', { source: r.source, mode: r.mode ?? 'signup' });
    // The resume rides on the return URL for the routes that leave the page:
    // Google's redirect and the email confirmation link (maybe a new tab).
    const url = new URL(r.redirectTo ?? window.location.pathname + window.location.search, window.location.origin);
    if (r.resume) url.searchParams.set(RESUME_PARAM, r.resume);
    setRequest({ ...r, redirectTo: url.pathname + url.search });
  }, []);

  // Signed in without leaving the page: no reload, so the action is handed
  // over directly. Pages the request named elsewhere still get navigated to.
  const onSignedIn = useCallback(() => {
    if (!request) return;
    setRequest(null);
    const here = window.location.pathname + window.location.search;
    const target = new URL(request.redirectTo, window.location.origin);
    target.searchParams.delete(RESUME_PARAM);
    if (target.pathname + target.search !== here) {
      window.location.assign(request.redirectTo);
    } else if (request.resume) {
      setPending(request.resume);
    }
  }, [request]);

  return (
    <SignupGateContext.Provider value={open}>
      <ResumeContext.Provider value={{ pending, consume }}>{children}</ResumeContext.Provider>
      {request && (
        <Suspense fallback={null}>
          <AuthModal
            open
            onOpenChange={(isOpen) => { if (!isOpen) setRequest(null); }}
            initialMode={request.mode ?? 'signup'}
            redirectTo={request.redirectTo}
            context={request.context}
            source={`gate_${request.source}`}
            onSuccess={onSignedIn}
          />
        </Suspense>
      )}
    </SignupGateContext.Provider>
  );
}

/** Opens the sign-up dialog for a guest. See SignupGateProvider. */
export function useSignupGate() {
  return useContext(SignupGateContext);
}

/** Resumes already taken this page load, so two mounts of one control (mobile + desktop) act once. */
const taken = new Set<string>();

/**
 * Finishes the action a guest started before signing up, once they're signed
 * in: `run` gets the value from the gate's `resume` ("watch:AAPL" -> "AAPL")
 * and returns true if it was this control's to handle. `ready` holds it back
 * until the control has what it needs (rows loaded, say).
 */
export function useResumeAction(kind: string, run: (value: string) => boolean, ready = true) {
  const { isAuthenticated } = useAuth();
  const { pending, consume } = useContext(ResumeContext);
  const runRef = useRef(run);
  useEffect(() => { runRef.current = run; });

  useEffect(() => {
    if (!isAuthenticated || !ready || !pending?.startsWith(`${kind}:`) || taken.has(pending)) return;
    if (!runRef.current(pending.slice(kind.length + 1))) return;
    taken.add(pending);
    consume();
    trackEvent('signup_gate_resumed', { kind });
  }, [isAuthenticated, ready, pending, kind, consume]);
}
