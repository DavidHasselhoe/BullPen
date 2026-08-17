// Auth Utilities
// Client-side authentication helpers using Supabase Auth

import { createBrowserClient } from '../supabase/client';
import { maybeClaimShareAttribution } from './share-attribution';
import { setLastUsedAuthMethod } from './last-used-method';

export interface AuthUser {
  id: string;
  email: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  role: string;
  bio: string | null;
  experience_level: 'beginner' | 'intermediate' | 'advanced' | null;
  market_focus: 'US' | 'EU' | 'BOTH' | null;
  risk_profile: 'conservative' | 'balanced' | 'aggressive' | null;
  // INTEGER in DB (migration 026): 1 = free, 2 = admin/staff, 3 = paid Pro.
  // Use `tierFromInt()` / `isPro()` from `lib/billing/tier.ts` instead of comparing this directly.
  account_tier: number | null;
  settings: Record<string, unknown> | null;
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

const RATE_LIMITED_ERROR = 'Too many attempts. Please wait a few minutes and try again.';

/**
 * Server-side throttle check for login/signup/reset (see
 * app/api/auth/rate-limit-check/route.ts for why this exists as a separate
 * gate rather than being built into Supabase's own client call). Fails open
 * on network error — a throttle check that can't reach our own server
 * shouldn't block auth entirely, and Supabase has its own platform-level
 * rate limits as a backstop.
 */
async function checkAuthThrottle(action: 'login' | 'signup' | 'reset', identifier: string): Promise<boolean> {
  try {
    const res = await fetch('/api/auth/rate-limit-check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, identifier }),
    });
    if (res.status === 429) return false;
    return true;
  } catch {
    return true;
  }
}

/**
 * Records a login outcome for the soft-lockout mechanism (see
 * lib/security/login-lockout.ts) — fire-and-forget, never blocks the login
 * flow on its own network round-trip.
 */
function reportLoginOutcome(email: string, outcome: 'success' | 'failure'): void {
  fetch('/api/auth/report-failed-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: email, outcome }),
  }).catch(() => {});
}

/**
 * Signs up a new user with email and password
 * Creates user in Supabase Auth and public.users table
 */
export async function signUp(params: SignUpParams): Promise<AuthResult> {
  const supabase = createBrowserClient();

  try {
    if (!(await checkAuthThrottle('signup', params.email))) {
      return { success: false, error: RATE_LIMITED_ERROR };
    }

    // Step 1: Create user in Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: params.email,
      password: params.password,
    });

    if (authError) {
      // Supabase reports a duplicate signup distinctly from other failures
      // (code 'user_already_exists'/'email_exists', or message text on older
      // SDK/server versions). Surfacing that verbatim lets an attacker
      // enumerate registered emails via the signup form, so it gets the same
      // generic "check your email" response as a fresh signup — indistinguishable
      // from the outside, same as the password-reset-request flow already is.
      const code = (authError as { code?: string }).code;
      const isDuplicate =
        code === 'user_already_exists' ||
        code === 'email_exists' ||
        /already registered|already exists/i.test(authError.message);
      if (isDuplicate) {
        return {
          success: true,
          user: {
            id: '',
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

      const msg = /fetch|network|timeout/i.test(authError.message)
        ? 'Connection failed. Please check your network and try again.'
        : authError.message;
      return { success: false, error: msg };
    }

    if (!authData.user) {
      return { success: false, error: 'Failed to create user' };
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
          errorMessage = 'Failed to create user profile. Please try signing in instead.';
        }
        
        return {
          success: false,
          error: errorMessage,
        };
      }

      userProfile = newProfile;
    }

    if (userProfile) {
      await maybeClaimShareAttribution((userProfile as AuthUser).id);
    }

    return {
      success: true,
      user: userProfile as AuthUser,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    const friendly = /fetch|network|timeout|abort/i.test(msg)
      ? 'Connection failed. Please check your network and try again.'
      : msg;
    return { success: false, error: friendly };
  }
}

/** Ensures a row exists in public.users (fallback if trigger missed). No-op if row exists. */
async function ensureUserProfileExists(
  supabase: ReturnType<typeof createBrowserClient>,
  userId: string,
  email: string
): Promise<void> {
  await supabase
    .from('users')
    .upsert(
      { id: userId, email, updated_at: new Date().toISOString() },
      { onConflict: 'id', ignoreDuplicates: true }
    );
}

/** Fetch user profile with retry on abort (handles production fetch cancellation). */
async function fetchUserProfileWithRetry(
  supabase: ReturnType<typeof createBrowserClient>,
  userId: string,
  maxRetries = 2
): Promise<{ data: AuthUser | null; error: string | null }> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (!error && data) return { data: data as AuthUser, error: null };
      const msg = error?.message ?? '';
      const isAbort = /abort|signal/i.test(msg);
      if (isAbort && attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
        continue;
      }
      return { data: null, error: msg || 'Profile not found' };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      const isAbort = /abort|signal/i.test(msg);
      if (isAbort && attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
        continue;
      }
      return { data: null, error: msg };
    }
  }
  return { data: null, error: 'Failed to fetch user profile' };
}

/**
 * Signs in a user with email and password
 * Updates last_login_at on success
 */
export async function signIn(params: SignInParams): Promise<AuthResult> {
  const supabase = createBrowserClient();

  try {
    if (!(await checkAuthThrottle('login', params.email))) {
      return { success: false, error: RATE_LIMITED_ERROR };
    }

    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: params.email,
      password: params.password,
    });

    if (authError) {
      const isNetworkError = /fetch|network|timeout|abort|signal/i.test(authError.message);
      // Only count genuine credential failures toward lockout — a dropped
      // connection isn't evidence of a guessed password.
      if (!isNetworkError) reportLoginOutcome(params.email, 'failure');
      const msg = isNetworkError ? 'Connection failed. Please check your network and try again.' : authError.message;
      return { success: false, error: msg };
    }

    if (!authData.user) {
      return { success: false, error: 'Failed to sign in' };
    }

    reportLoginOutcome(params.email, 'success');

    const userId = authData.user.id;
    const email = authData.user.email ?? params.email;

    // Ensure users row exists (fallback if DB trigger missed)
    await ensureUserProfileExists(supabase, userId, email);

    // Update last_login_at
    await supabase.from('users').update({ last_login_at: new Date().toISOString() }).eq('id', userId);

    // Safety net for the "email confirmation required" signup path: signUp()
    // returns before a session exists there, so it can't claim attribution
    // itself — the user's first real sign-in does it instead. No-ops
    // instantly once already attributed, so safe on every sign-in.
    await maybeClaimShareAttribution(userId);

    // Fetch user profile (with retry on abort)
    const { data: userProfile, error: profileError } = await fetchUserProfileWithRetry(supabase, userId);

    if (profileError || !userProfile) {
      const errMsg = /abort|signal|fetch|network/i.test(profileError ?? '')
        ? 'Connection was interrupted. Please try again.'
        : 'Failed to fetch user profile. Please try again.';
      return { success: false, error: errMsg };
    }

    setLastUsedAuthMethod('email');
    return { success: true, user: userProfile };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    const friendly = /fetch|network|timeout|abort|signal/i.test(msg)
      ? 'Connection failed. Please check your network and try again.'
      : msg;
    return { success: false, error: friendly };
  }
}

/**
 * Clears Supabase auth session from localStorage.
 * Used when logout API returns 403 (session_not_found) - the server has no session,
 * but the client may still have a stale one. Clearing ensures the user appears logged out after reload.
 */
function clearSupabaseAuthStorage(): void {
  if (typeof window === 'undefined') return;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return;

  const match = url.match(/https:\/\/([^.]+)\.supabase\.co/);
  const projectRef = match?.[1];
  if (!projectRef) return;

  const prefix = `sb-${projectRef}-`;
  const keysToRemove: string[] = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (key?.startsWith(prefix)) keysToRemove.push(key);
  }
  keysToRemove.forEach((k) => window.localStorage.removeItem(k));
}

/**
 * Signs out the current user
 * Uses scope: 'local' to avoid 403 from Supabase global logout (common after deploy or with stale sessions).
 * Local scope clears the session in this browser without invalidating other devices.
 * When the API returns 403 (session_not_found), we manually clear localStorage since Supabase may not.
 */
export async function signOut(): Promise<{ success: boolean; error?: string }> {
  const supabase = createBrowserClient();

  try {
    const { error } = await supabase.auth.signOut({ scope: 'local' });

    if (error) {
      // 403/session_not_found: server has no session, but client may have stale one in localStorage.
      // Supabase does not clear storage on API failure - we must do it so reload shows logged-out state.
      const status = (error as { status?: number }).status;
      const is403 =
        status === 403 ||
        error.message?.includes('403') ||
        error.message?.toLowerCase().includes('forbidden') ||
        /session_not_found/i.test(error.message ?? '');
      if (is403) {
        clearSupabaseAuthStorage();
        return { success: true };
      }
      return {
        success: false,
        error: error.message,
      };
    }

    // API succeeded - Supabase clears storage, but we clear too as a safety measure
    clearSupabaseAuthStorage();
    return { success: true };
  } catch (error) {
    // Network/403 errors - still treat as success; clear storage so reload shows logged-out state
    const msg = error instanceof Error ? error.message : 'Unknown error';
    if (/403|forbidden|fetch|network|session_not_found/i.test(msg)) {
      clearSupabaseAuthStorage();
      return { success: true };
    }
    return {
      success: false,
      error: msg,
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
  } catch {
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

/**
 * Sends a password reset email. The link redirects to /auth/reset-password,
 * which exchanges the code for a recovery session and lets the user set a new password.
 * Always returns success (regardless of whether the email is registered) to avoid
 * leaking account existence.
 */
export async function sendPasswordResetEmail(email: string): Promise<{ success: boolean; error?: string }> {
  const supabase = createBrowserClient();

  try {
    if (!(await checkAuthThrottle('reset', email))) {
      return { success: false, error: RATE_LIMITED_ERROR };
    }

    const redirectTo = new URL('/auth/reset-password', window.location.origin).toString();
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });

    if (error) {
      const msg = /fetch|network|timeout/i.test(error.message)
        ? 'Connection failed. Please check your network and try again.'
        : error.message;
      return { success: false, error: msg };
    }

    return { success: true };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    const friendly = /fetch|network|timeout|abort/i.test(msg)
      ? 'Connection failed. Please check your network and try again.'
      : msg;
    return { success: false, error: friendly };
  }
}

/**
 * Signs in with Google OAuth
 * According to Supabase docs: https://supabase.com/docs/guides/auth/social-login/auth-google
 */
export async function signInWithGoogle(next?: string): Promise<{ success: boolean; error?: string }> {
  const supabase = createBrowserClient();

  try {
    const callback = new URL('/auth/callback', window.location.origin);
    // Carry the post-auth destination (e.g. /upgrade?checkout=annual) through OAuth.
    if (next && next.startsWith('/') && !next.startsWith('//')) {
      callback.searchParams.set('next', next);
    }

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: callback.toString(),
      },
    });

    if (error) {
      const msg = /fetch|network|timeout|522/i.test(error.message)
        ? 'Connection failed. Please check your network and try again.'
        : error.message;
      return { success: false, error: msg };
    }

    return { success: true };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    const friendly = /fetch|network|timeout|abort/i.test(msg)
      ? 'Connection failed. Please check your network and try again.'
      : msg;
    return { success: false, error: friendly };
  }
}
