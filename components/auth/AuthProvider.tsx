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

const RETRY_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 15_000];

/**
 * The caller's profile, or null when the session is not valid (or has no row).
 *
 * A database outage is not a sign-out. On 2026-11-16 a crawler burst made
 * Supabase answer 520/503 after 35s; this used to return null on any error,
 * which set user to null and showed a signed-in user as signed out while
 * their session cookie was fine. Now 5xx and network failures are retried
 * with backoff for as long as `stillWanted()` holds, so the app stays in its
 * loading state and recovers when the database does. Only an auth-type
 * answer (4xx, or the row of nulls an invalid session gets) returns null.
 */
async function fetchUserProfile(
  supabase: ReturnType<typeof createBrowserClient>,
  stillWanted: () => boolean
): Promise<AuthUser | null> {
  for (let attempt = 0; ; attempt++) {
    try {
      // Sensitive columns (email/role/account_tier/pro_bonus_until/stripe_*)
      // are no longer selectable via the base table for the browser client —
      // see migration 121_users_column_scoping.sql. This RPC is scoped hard
      // to auth.uid() server-side, so it only ever returns the caller's own row.
      const { data, error, status } = await supabase.rpc('get_own_profile');
      const row = data as AuthUser | null;
      if (!error && row?.id) return row;
      if (!error || (status > 0 && status < 500)) return null;
    } catch {
      // Network failure: retry like a 5xx.
    }
    if (!stillWanted()) return null;
    await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)]));
    if (!stillWanted()) return null;
  }
}

async function loadUserFromSession(
  supabase: ReturnType<typeof createBrowserClient>,
  session: Session,
  isNewSignIn: boolean,
  stillWanted: () => boolean
): Promise<AuthUser | null> {
  if (isNewSignIn) {
    try {
      const { processOAuthProfile } = await import('@/lib/auth/oauth-profile');
      await processOAuthProfile(session.user).catch(() => {});
    } catch {
      // Profile setup is best-effort; the fetch below still runs.
    }
    // Write any pre-signup quiz answers now that the account exists. Covers
    // both the email and Google OAuth paths, since both funnel through this
    // same SIGNED_IN handler. Never throws — a no-op when nothing is pending.
    await flushPendingOnboardingData(session.user.id).catch(() => {});
  }
  return fetchUserProfile(supabase, stillWanted);
}

/**
 * Supabase fires SIGNED_IN on every page load and tab refocus, not only at a
 * real sign-in, so "new sign-in" is judged by the account's last sign-in time.
 * Treating every load as one re-ran the OAuth profile upsert and a third
 * profile fetch on each page view (measured 2026-11-15).
 */
// Remembers the last sign-in this browser handled. Not a clock comparison: a
// device clock a minute off would skip a real sign-in's profile setup.
const HANDLED_SIGN_IN_KEY = 'bp_handled_sign_in';
function isFreshSignIn(session: Session): boolean {
  const mark = `${session.user.id}:${session.user.last_sign_in_at ?? ''}`;
  try {
    if (localStorage.getItem(HANDLED_SIGN_IN_KEY) === mark) return false;
    localStorage.setItem(HANDLED_SIGN_IN_KEY, mark);
  } catch {
    // No storage (private mode): treat as new, the old behaviour.
  }
  return true;
}

export function AuthProvider({ children, initialUser = null }: { children: React.ReactNode; initialUser?: AuthUser | null }) {
  // Signed in on the server: start signed in, so user queries don't wait on
  // the browser's own profile fetch. Signed out: wait for the client session
  // as before (a legacy localStorage session can still turn up).
  const [user, setUser] = useState<AuthUser | null>(initialUser);
  const [isLoading, setIsLoading] = useState(!initialUser);
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
      const uid = session.user.id;
      const profile = await fetchUserProfile(supabase, () => profileForRef.current === uid);
      // A failed reload keeps the profile already shown: the session is still there.
      if (profile) setUser(profile);
    } catch {
      // getSession() reads the cookie; nothing here means signed out.
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
        const uid = session.user.id;
        profileForRef.current = uid;
        // A sign-out or another account's sign-in during the retries takes over.
        const stillWanted = () => mounted && profileForRef.current === uid;
        // Stays loading (not signed out) while the database is unreachable.
        const profile = await loadUserFromSession(supabase, session, isNewSignIn, stillWanted);
        if (!stillWanted()) return;
        setUser(profile);
        // No profile for this session: the next auth event may try again.
        if (!profile) profileForRef.current = null;
        setIsLoading(false);
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
