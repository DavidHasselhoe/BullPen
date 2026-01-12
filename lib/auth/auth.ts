// Auth Utilities
// Client-side authentication helpers using Supabase Auth

import { createBrowserClient } from '../supabase/client';
import type { User } from '../types/database';

export interface AuthUser {
  id: string;
  email: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  role: string;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
}

export interface SignUpParams {
  email: string;
  password: string;
}

export interface SignInParams {
  email: string;
  password: string;
}

export interface AuthResult {
  success: boolean;
  user?: AuthUser | null;
  error?: string;
  requiresEmailConfirmation?: boolean;
}

/**
 * Signs up a new user with email and password
 * Creates user in Supabase Auth and public.users table
 */
export async function signUp(params: SignUpParams): Promise<AuthResult> {
  const supabase = createBrowserClient();

  try {
    // Step 1: Create user in Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: params.email,
      password: params.password,
    });

    if (authError) {
      return {
        success: false,
        error: authError.message,
      };
    }

    if (!authData.user) {
      return {
        success: false,
        error: 'Failed to create user',
      };
    }

    // Step 2: Check if session is available
    // After signUp(), Supabase may or may not automatically sign in the user
    // If email confirmation is required, there will be no session yet
    // The trigger should still create the profile automatically via SECURITY DEFINER
    let session = authData.session;
    
    // If no session, wait a bit and check again (in case of async session creation)
    if (!session) {
      await new Promise(resolve => setTimeout(resolve, 500));
      const { data: { session: checkSession } } = await supabase.auth.getSession();
      session = checkSession || null;
    }

    // Step 3: Handle email confirmation case
    // If email confirmation is enabled, there's no session yet
    // The trigger should have created the profile, but we can't verify it via RLS without a session
    // In this case, we'll assume the trigger worked and return success with a message
    if (!session) {
      // Email confirmation is required - trigger should have created the profile
      // We can't verify it without a session due to RLS, but the trigger runs with SECURITY DEFINER
      // So it should have worked. Return success with a special indicator.
      return {
        success: true,
        user: {
          id: authData.user.id,
          email: params.email,
          username: null,
          full_name: null,
          avatar_url: null,
          role: 'user',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          last_login_at: null,
        } as AuthUser,
        requiresEmailConfirmation: true,
      };
    }

    // Step 4: Session is available - verify profile exists
    // The database trigger should automatically create the row
    // Poll for the profile to appear (up to 3 seconds)
    let userProfile = null;
    let attempts = 0;
    const maxAttempts = 6; // 6 attempts * 500ms = 3 seconds

    while (attempts < maxAttempts && !userProfile) {
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('*')
        .eq('id', authData.user.id)
        .single();

      if (profile && !profileError) {
        userProfile = profile;
        break;
      }

      attempts++;
    }

    // Step 5: If profile still doesn't exist, try to insert manually (fallback)
    // We have a session, so the RLS policy should allow the insert
    if (!userProfile) {
      const { data: newProfile, error: insertError } = await supabase
        .from('users')
        .insert({
          id: authData.user.id,
          email: params.email,
          role: 'user',
        })
        .select()
        .single();

      if (insertError) {
        console.error('Failed to create user profile:', insertError);
        // Provide a more helpful error message
        let errorMessage = 'Failed to create user profile. Please try signing in.';
        
        if (insertError.message) {
          errorMessage = insertError.message;
        } else if (typeof insertError === 'string') {
          errorMessage = insertError;
        } else if (insertError.details) {
          errorMessage = insertError.details;
        } else if (insertError.hint) {
          errorMessage = insertError.hint;
        } else if (insertError.code) {
          errorMessage = `Database error: ${insertError.code}`;
        } else {
          // Log full error object for debugging
          console.error('Full insert error:', JSON.stringify(insertError, null, 2));
          errorMessage = 'Failed to create user profile. Please try signing in instead.';
        }
        
        return {
          success: false,
          error: errorMessage,
        };
      }

      userProfile = newProfile;
    }

    return {
      success: true,
      user: userProfile as AuthUser,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Signs in a user with email and password
 * Updates last_login_at on success
 */
export async function signIn(params: SignInParams): Promise<AuthResult> {
  const supabase = createBrowserClient();

  try {
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: params.email,
      password: params.password,
    });

    if (authError) {
      return {
        success: false,
        error: authError.message,
      };
    }

    if (!authData.user) {
      return {
        success: false,
        error: 'Failed to sign in',
      };
    }

    // Update last_login_at
    await supabase
      .from('users')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', authData.user.id);

    // Fetch user profile
    const { data: userProfile, error: profileError } = await supabase
      .from('users')
      .select('*')
      .eq('id', authData.user.id)
      .single();

    if (profileError || !userProfile) {
      return {
        success: false,
        error: 'Failed to fetch user profile',
      };
    }

    return {
      success: true,
      user: userProfile as AuthUser,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Signs out the current user
 */
export async function signOut(): Promise<{ success: boolean; error?: string }> {
  const supabase = createBrowserClient();

  try {
    const { error } = await supabase.auth.signOut();

    if (error) {
      return {
        success: false,
        error: error.message,
      };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Gets the current authenticated user
 */
export async function getCurrentUser(): Promise<AuthUser | null> {
  const supabase = createBrowserClient();

  try {
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();

    if (authError || !authUser) {
      return null;
    }

    const { data: userProfile, error: profileError } = await supabase
      .from('users')
      .select('*')
      .eq('id', authUser.id)
      .single();

    if (profileError || !userProfile) {
      return null;
    }

    return userProfile as AuthUser;
  } catch (error) {
    console.error('Error getting current user:', error);
    return null;
  }
}

/**
 * Gets the current session
 */
export async function getSession() {
  const supabase = createBrowserClient();
  return await supabase.auth.getSession();
}
