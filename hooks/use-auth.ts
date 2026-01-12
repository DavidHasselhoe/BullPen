'use client';

// Auth Hook
// Provides current user state and auth operations

import { useEffect, useState, useMemo } from 'react';
import { createBrowserClient } from '@/lib/supabase/client';
import type { AuthUser } from '@/lib/auth/auth';

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  // Create a stable reference to the Supabase client (singleton)
  const supabase = useMemo(() => createBrowserClient(), []);

  useEffect(() => {
    let mounted = true;

    // Helper function to fetch user profile
    const fetchUserProfile = async (userId: string): Promise<AuthUser | null> => {
      try {
        const { data: userProfile, error: profileError } = await supabase
          .from('users')
          .select('*')
          .eq('id', userId)
          .single();

        if (profileError || !userProfile) {
          return null;
        }

        return userProfile as AuthUser;
      } catch (error) {
        console.error('Error fetching user profile:', error);
        return null;
      }
    };

    // Initial load - get session and user
    const initializeAuth = async () => {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (!mounted) return;

        if (sessionError || !session?.user) {
          setUser(null);
          setIsLoading(false);
          return;
        }

        const userProfile = await fetchUserProfile(session.user.id);
        if (mounted) {
          setUser(userProfile);
          setIsLoading(false);
        }
      } catch (error) {
        console.error('Error initializing auth:', error);
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
            const userProfile = await fetchUserProfile(session.user.id);
            if (mounted) {
              setUser(userProfile);
              setIsLoading(false);
            }
          } catch (error) {
            console.error('Error fetching user profile after auth change:', error);
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