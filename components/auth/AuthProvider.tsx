'use client';

/**
 * AuthProvider - Event-driven auth state
 *
 * Relies entirely on supabase.auth.onAuthStateChange(). No timing workarounds.
 * - INITIAL_SESSION: load existing session from storage
 * - SIGNED_IN: set session, ensure profile, load user
 * - TOKEN_REFRESHED: update session
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
import { createBrowserClient } from '@/lib/supabase/client';
import type { AuthUser } from '@/lib/auth/auth';

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const USERS_FETCH_COOLDOWN_MS = 30_000;
const DEBUG_AUTH = false; // Set true to log auth events during development

async function fetchUserProfile(
  supabase: ReturnType<typeof createBrowserClient>,
  userId: string,
  lastErrorRef: React.MutableRefObject<number>
): Promise<AuthUser | null> {
  const now = Date.now();
  if (now - lastErrorRef.current < USERS_FETCH_COOLDOWN_MS) return null;

  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, email, username, full_name, avatar_url, role, bio, experience_level, market_focus, risk_profile, account_tier, created_at, updated_at, last_login_at, settings')
      .eq('id', userId)
      .single();

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
  }
  return fetchUserProfile(supabase, session.user.id, lastErrorRef);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const lastErrorRef = useRef(0);
  const supabase = useMemo(() => createBrowserClient(), []);

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

  useEffect(() => {
    let mounted = true;

    const handleAuthChange = async (
      event: 'INITIAL_SESSION' | 'SIGNED_IN' | 'SIGNED_OUT' | 'TOKEN_REFRESHED',
      session: Session | null
    ) => {
      if (DEBUG_AUTH) {
        console.log('[Auth]', event, session?.user?.id ?? 'no session');
      }
      if (!mounted) return;

      if (event === 'SIGNED_OUT') {
        setUser(null);
        setIsLoading(false);
        return;
      }

      if ((event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session?.user) {
        const isNewSignIn = event === 'SIGNED_IN';
        try {
          const profile = await loadUserFromSession(
            supabase,
            session,
            lastErrorRef,
            isNewSignIn
          );
          if (mounted) setUser(profile);
        } catch {
          if (mounted) setUser(null);
        }
        if (mounted) {
          setIsLoading(false);
          if (DEBUG_AUTH) console.log('[Auth] profile loaded for', session.user.id);
        }
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      void handleAuthChange(
        event as 'INITIAL_SESSION' | 'SIGNED_IN' | 'SIGNED_OUT' | 'TOKEN_REFRESHED',
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
  }, [supabase]);

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
