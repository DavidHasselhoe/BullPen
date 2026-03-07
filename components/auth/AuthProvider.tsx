'use client';

/**
 * AuthProvider - Single source of truth for auth state
 *
 * Uses React Context so all consumers share the same state. This fixes the issue
 * where login/logout would succeed (session in localStorage) but the UI wouldn't
 * update because multiple useAuth instances had stale state.
 *
 * After auth changes, we use full page reload (window.location) to guarantee
 * a fresh load with correct session state - same as "close tab and reopen".
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

async function fetchUserProfile(
  supabase: ReturnType<typeof createBrowserClient>,
  userId: string,
  lastErrorRef: React.MutableRefObject<number>
): Promise<AuthUser | null> {
  const now = Date.now();
  if (now - lastErrorRef.current < USERS_FETCH_COOLDOWN_MS) {
    return null;
  }

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
    let unsub: (() => void) | null = null;

    // Subscribe first so we never miss auth events
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
        async (event, session) => {
          if (!mounted) return;

          if (event === 'SIGNED_OUT') {
            setUser(null);
            setIsLoading(false);
            return;
          }

          if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
            if (!session?.user) {
              setUser(null);
              setIsLoading(false);
              return;
            }
            try {
              if (event === 'SIGNED_IN') {
                const { processOAuthProfile } = await import('@/lib/auth/oauth-profile');
                await processOAuthProfile(session.user).catch(() => {
                  lastErrorRef.current = Date.now();
                });
              }
              let profile = await fetchUserProfile(supabase, session.user.id, lastErrorRef);
              if (!profile && mounted) {
                await new Promise((r) => setTimeout(r, 500));
                profile = await fetchUserProfile(supabase, session.user.id, lastErrorRef);
              }
              if (mounted) {
                setUser(profile);
                setIsLoading(false);
              }
            } catch {
              if (mounted) {
                setUser(null);
                setIsLoading(false);
              }
            }
          }
        }
      );

      return () => {
        mounted = false;
        subscription.unsubscribe();
      };
    };

    const cleanup = initAndSubscribe();
    return () => {
      mounted = false;
      cleanup?.then((fn) => fn?.());
    };
  }, [supabase]);

  // Manual refresh listener (e.g. after profile update)
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
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
