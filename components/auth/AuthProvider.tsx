'use client';

/**
 * AuthProvider - Event-driven auth state
 *
 * Relies entirely on supabase.auth.onAuthStateChange(). No timing workarounds.
 * - INITIAL_SESSION: load existing session from storage
 * - SIGNED_IN: set session, ensure profile, load user
 * - TOKEN_REFRESHED: update session
 * - PASSWORD_RECOVERY: verifyOtp() on /auth/reset-password establishes a session this way, not SIGNED_IN
 * - USER_UPDATED: fires after updateUser() (e.g. the reset-password / change-password flows)
 * - SIGNED_OUT: clear state
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useMemo,
  useRef,
  useCallback,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '@/lib/supabase/client';
import type { AuthUser } from '@/lib/auth/auth';
import { flushPendingOnboardingData } from '@/lib/onboarding/flush';

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const USERS_FETCH_COOLDOWN_MS = 30_000;

async function fetchUserProfile(
  supabase: ReturnType<typeof createBrowserClient>,
  userId: string,
  lastErrorRef: React.MutableRefObject<number>
): Promise<AuthUser | null> {
  const now = Date.now();
  if (now - lastErrorRef.current < USERS_FETCH_COOLDOWN_MS) return null;

  try {
    // Sensitive columns (email/role/account_tier/pro_bonus_until/stripe_*)
    // are no longer selectable via the base table for the browser client —
    // see migration 121_users_column_scoping.sql. This RPC is scoped hard
    // to auth.uid() server-side, so it only ever returns the caller's own row.
    const { data, error } = await supabase.rpc('get_own_profile');

    if (error || !data) {
      lastErrorRef.current = Date.now();
      return null;
    }
    return data as AuthUser;
  } catch {
    lastErrorRef.current = Date.now();
    return null;
  }
}

async function loadUserFromSession(
  supabase: ReturnType<typeof createBrowserClient>,
  session: Session,
  lastErrorRef: React.MutableRefObject<number>,
  isNewSignIn: boolean
): Promise<AuthUser | null> {
  if (isNewSignIn) {
    try {
      const { processOAuthProfile } = await import('@/lib/auth/oauth-profile');
      await processOAuthProfile(session.user).catch(() => {
        lastErrorRef.current = Date.now();
      });
    } catch {
      lastErrorRef.current = Date.now();
    }
    // Write any pre-signup quiz answers now that the account exists. Covers
    // both the email and Google OAuth paths, since both funnel through this
    // same SIGNED_IN handler. Never throws — a no-op when nothing is pending.
    await flushPendingOnboardingData(session.user.id).catch(() => {});
  }
  return fetchUserProfile(supabase, session.user.id, lastErrorRef);
}

/**
 * Supabase fires SIGNED_IN on every page load and tab refocus, not only at a
 * real sign-in, so "new sign-in" is judged by the account's last sign-in time.
 * Treating every load as one re-ran the OAuth profile upsert and a third
 * profile fetch on each page view (measured 2026-11-15).
 */
const FRESH_SIGN_IN_MS = 60_000;
function isFreshSignIn(session: Session): boolean {
  const at = Date.parse(session.user.last_sign_in_at ?? '');
  return Number.isFinite(at) && Date.now() - at < FRESH_SIGN_IN_MS;
}

export function AuthProvider({ children, initialUser = null }: { children: React.ReactNode; initialUser?: AuthUser | null }) {
  // Signed in on the server: start signed in, so user queries don't wait on
  // the browser's own profile fetch. Signed out: wait for the client session
  // as before (a legacy localStorage session can still turn up).
  const [user, setUser] = useState<AuthUser | null>(initialUser);
  const [isLoading, setIsLoading] = useState(!initialUser);
  const lastErrorRef = useRef(0);
  // Whose profile is loaded or loading, so the INITIAL_SESSION event, the
  // getSession() fallback and token refreshes don't each fetch it again.
  const profileForRef = useRef<string | null>(initialUser?.id ?? null);
  const supabase = useMemo(() => createBrowserClient(), []);
  const queryClient = useQueryClient();
  // Tracks whose data is currently cached in TanStack Query, so a sign-out or
  // an account switch in the same tab can drop it before the next widget
  // renders. Without this, a Pro-gated widget that only checks its own query's
  // cached success state (rather than live auth) keeps showing the previous
  // session's real content after that session ends.
  const cachedForUserIdRef = useRef<string | null>(initialUser?.id ?? null);

  const refresh = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        setUser(null);
        return;
      }
      const profile = await fetchUserProfile(supabase, session.user.id, lastErrorRef);
      setUser(profile);
    } catch {
      setUser(null);
    }
  }, [supabase]);

  // One-time migration: sync session from localStorage to cookies (required for Server Actions)
  // Old client stored in localStorage; new @supabase/ssr client uses cookies.
  useEffect(() => {
    void (async () => {
      const STORAGE_KEY_PREFIX = 'sb-';
      const STORAGE_KEY_SUFFIX = '-auth-token';
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key?.startsWith(STORAGE_KEY_PREFIX) || !key.endsWith(STORAGE_KEY_SUFFIX)) continue;
        try {
          const raw = localStorage.getItem(key);
          if (!raw) continue;
          const data = JSON.parse(raw) as { access_token?: string; refresh_token?: string };
          if (data?.access_token && data?.refresh_token) {
            await supabase.auth.setSession({
              access_token: data.access_token,
              refresh_token: data.refresh_token,
            });
            localStorage.removeItem(key);
            break; // Migrated one, done
          }
        } catch {
          // Ignore parse errors
        }
      }
    })();
  }, [supabase]);

  useEffect(() => {
    let mounted = true;

    const handleAuthChange = async (
      event: 'INITIAL_SESSION' | 'SIGNED_IN' | 'SIGNED_OUT' | 'TOKEN_REFRESHED' | 'PASSWORD_RECOVERY' | 'USER_UPDATED',
      session: Session | null
    ) => {
      if (!mounted) return;

      if (event === 'SIGNED_OUT' || (event === 'INITIAL_SESSION' && !session?.user)) {
        if (event === 'SIGNED_OUT') queryClient.clear();
        cachedForUserIdRef.current = null;
        profileForRef.current = null;
        setUser(null);
        setIsLoading(false);
        return;
      }

      if (
        (event === 'INITIAL_SESSION' ||
          event === 'SIGNED_IN' ||
          event === 'TOKEN_REFRESHED' ||
          event === 'PASSWORD_RECOVERY' ||
          event === 'USER_UPDATED') &&
        session?.user
      ) {
        // A different account signed in on top of cached data from a previous
        // one (same tab, no full reload) — drop it so nothing from that
        // earlier session bleeds into this one.
        if (cachedForUserIdRef.current && cachedForUserIdRef.current !== session.user.id) {
          queryClient.clear();
        }
        cachedForUserIdRef.current = session.user.id;

        const isNewSignIn = event === 'SIGNED_IN' && isFreshSignIn(session);
        // Same account, profile already here or on its way: nothing changed
        // that the profile row holds (USER_UPDATED still reloads it). isLoading
        // is left to the fetch in flight: false here would read as signed out.
        if (!isNewSignIn && event !== 'USER_UPDATED' && profileForRef.current === session.user.id) return;
        profileForRef.current = session.user.id;
        try {
          const profile = await loadUserFromSession(
            supabase,
            session,
            lastErrorRef,
            isNewSignIn
          );
          if (mounted) setUser(profile);
          // A failed fetch leaves the next auth event free to try again.
          if (!profile) profileForRef.current = null;
        } catch {
          profileForRef.current = null;
          if (mounted) setUser(null);
        }
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      void handleAuthChange(
        event as 'INITIAL_SESSION' | 'SIGNED_IN' | 'SIGNED_OUT' | 'TOKEN_REFRESHED' | 'PASSWORD_RECOVERY' | 'USER_UPDATED',
        session
      );
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      if (session?.user) {
        handleAuthChange('INITIAL_SESSION', session);
      } else {
        setIsLoading(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase, queryClient]);

  useEffect(() => {
    const handler = () => refresh();
    window.addEventListener('auth:refresh', handler);
    return () => window.removeEventListener('auth:refresh', handler);
  }, [refresh]);

  const value = useMemo(
    () => ({
      user,
      isLoading,
      isAuthenticated: !!user,
      refresh,
    }),
    [user, isLoading, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
