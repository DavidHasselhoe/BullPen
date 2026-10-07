'use client';

import { createContext, lazy, Suspense, useCallback, useContext, useState, type ReactNode } from 'react';
import type { AuthMode } from '@/components/auth/AuthModal';
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
}

const SignupGateContext = createContext<(request: SignupGateRequest) => void>(() => {});

/**
 * The one way a guest is asked for an account inside the app: the sign-up
 * dialog over the page they are on, opened at the moment they try something,
 * with a line saying what that thing needs the account for. Google first,
 * email below, "Sign in" one tab away. They never leave the page, and every
 * route back (in place, Google, the email confirmation link) returns here.
 */
export function SignupGateProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<(SignupGateRequest & { redirectTo: string }) | null>(null);

  const open = useCallback((r: SignupGateRequest) => {
    trackEvent('signup_gate_shown', { source: r.source, mode: r.mode ?? 'signup' });
    setRequest({ ...r, redirectTo: r.redirectTo ?? window.location.pathname + window.location.search });
  }, []);

  return (
    <SignupGateContext.Provider value={open}>
      {children}
      {request && (
        <Suspense fallback={null}>
          <AuthModal
            open
            onOpenChange={(isOpen) => { if (!isOpen) setRequest(null); }}
            initialMode={request.mode ?? 'signup'}
            redirectTo={request.redirectTo}
            context={request.context}
            source={`gate_${request.source}`}
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
