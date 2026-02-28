'use client';

// Auth Hook
// Provides current user state and auth operations

import { useEffect, useState, useMemo, useRef } from 'react';
import { createBrowserClient } from '@/lib/supabase/client';
import type { AuthUser } from '@/lib/auth/auth';

/** Cooldown after users table error (503, etc.) to avoid retry storm */
const USERS_FETCH_COOLDOWN_MS = 30_000;

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const lastUsersFetchErrorRef = useRef<number>(0);

  // Create a stable reference to the Supabase client (singleton)
  const supabase = useMemo(() => createBrowserClient(), []);

  useEffect(() => {
    let mounted = true;

    // Helper function to fetch user profile
    const fetchUserProfile = async (userId: string): Promise<AuthUser | null> => {
      // Circuit breaker: skip if we recently got an error (503, etc.)
      const now = Date.now();
      if (now - lastUsersFetchErrorRef.current < USERS_FETCH_COOLDOWN_MS) {
        return null;
      }

      try {
        const { data: userProfile, error: profileError } = await supabase
          .from('users')
          .select('id, email, username, full_name, avatar_url, role, created_at, updated_at, last_login_at')
          .eq('id', userId)
          .single();

        if (profileError || !userProfile) {
          lastUsersFetchErrorRef.current = Date.now();
          return null;
        }

        return userProfile as AuthUser;
      } catch (error) {
        lastUsersFetchErrorRef.current = Date.now();
        return null;
      }
    };

    // Initial load - get session and user (with 5s timeout to avoid hanging)
    const initializeAuth = async () => {
      const AUTH_TIMEOUT_MS = 5000;
      try {
        const sessionPromise = supabase.auth.getSession();
        const timeoutPromise = new Promise<'timeout'>((resolve) =>
          setTimeout(() => resolve('timeout'), AUTH_TIMEOUT_MS)
        );
        const result = await Promise.race([
          sessionPromise.then((r) => ({ type: 'session' as const, ...r })),
          timeoutPromise.then((v) => ({ type: v })),
        ]);
        if (result.type === 'timeout') throw new Error('Auth timeout');
        const { data: { session }, error: sessionError } = result;
        
        if (!mounted) return;

        if (sessionError || !session?.user) {
          setUser(null);
          setIsLoading(false);
          return;
        }

        // Process OAuth profile on initial load if needed (e.g., after redirect)
        // Skip if in cooldown (Supabase 503) to avoid retry storm
        if (Date.now() - lastUsersFetchErrorRef.current >= USERS_FETCH_COOLDOWN_MS) {
          try {
            const { processOAuthProfile } = await import('@/lib/auth/oauth-profile');
            await processOAuthProfile(session.user);
          } catch {
            lastUsersFetchErrorRef.current = Date.now();
          }
        }

        const userProfile = await fetchUserProfile(session.user.id);
        if (mounted) {
          setUser(userProfile);
          setIsLoading(false);
        }
      } catch (error) {
        const err = error as Error;
        // AbortError, "Failed to fetch", timeout: treat as unauthenticated, don't block UI
        if (err?.name === 'AbortError' || err?.message === 'Failed to fetch' || err?.message === 'Auth timeout') {
          if (mounted) {
            setUser(null);
            setIsLoading(false);
          }
          return;
        }
        if (mounted) {
          setUser(null);
          setIsLoading(false);
        }
      }
    };

    initializeAuth();

    // Listen for auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;

      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        if (session?.user) {
          try {
            // Process OAuth profile data if this is a new sign-in (skip if in cooldown)
            if (event === 'SIGNED_IN' && Date.now() - lastUsersFetchErrorRef.current >= USERS_FETCH_COOLDOWN_MS) {
              try {
                const { processOAuthProfile } = await import('@/lib/auth/oauth-profile');
                await processOAuthProfile(session.user);
              } catch {
                lastUsersFetchErrorRef.current = Date.now();
              }
            }

            // Fetch updated user profile
            const userProfile = await fetchUserProfile(session.user.id);
            if (mounted) {
              setUser(userProfile);
              setIsLoading(false);
            }
          } catch (error) {
            if (mounted) {
              setUser(null);
              setIsLoading(false);
            }
          }
        } else {
          if (mounted) {
            setUser(null);
            setIsLoading(false);
          }
        }
      } else if (event === 'SIGNED_OUT') {
        if (mounted) {
          setUser(null);
          setIsLoading(false);
        }
      } else {
        // Handle other events (like USER_UPDATED)
        if (session?.user) {
          const userProfile = await fetchUserProfile(session.user.id);
          if (mounted) {
            setUser(userProfile);
            setIsLoading(false);
          }
        } else if (mounted) {
          setIsLoading(false);
        }
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
  };
}