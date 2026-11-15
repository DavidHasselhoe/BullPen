/**
 * Server-side session utilities for Server Actions
 * Resolves the authenticated user from cookies — never trust client-provided userId.
 */

import { cache } from 'react';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import type { Database } from '@/lib/supabase/types';
import type { AuthUser } from '@/lib/auth/auth';

/**
 * Create a Supabase client that reads/writes the session from Next.js cookies.
 * Use only in Server Actions and Route Handlers.
 */
export async function createSessionClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase environment variables');
  }

  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Ignored when called from Server Component (read-only)
          }
        },
      },
    }
  );
}

/**
 * Get authenticated user ID from Supabase session in Server Actions.
 *
 * Uses `getUser()`, NOT `getSession()` — `getSession()` reads the session
 * straight out of cookie storage and only checks that a few expected keys are
 * present, without verifying the JWT signature or contacting the Auth server.
 * Since that cookie is just base64url(JSON) with no integrity protection, a
 * request with a hand-crafted `Cookie` header could otherwise impersonate any
 * user by ID. `getUser()` round-trips to Supabase Auth and cryptographically
 * validates the token before trusting the returned user.
 */
export async function getCurrentUserId(): Promise<string | null> {
  try {
    const supabase = await createSessionClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      return null;
    }

    return user.id;
  } catch {
    return null;
  }
}

/**
 * The signed-in user's own profile for this request, or null when signed out.
 * React cache(): the root layout and a page asking in the same request share
 * one RPC.
 *
 * get_own_profile runs with the session's JWT, which PostgREST verifies, so a
 * forged cookie gets no row, and `id` is safe to scope server reads by.
 *
 * The root layout hands this to AuthProvider so signed-in pages don't wait
 * on the browser's own profile fetch (0.15-1.9s measured 2026-11-15) before
 * any user query may start. Never cached across users: every route that reads
 * cookies() renders per request, and force-static routes see no cookies.
 */
const PROFILE_WAIT_MS = 400;
export const getServerProfile = cache(async (): Promise<AuthUser | null> => {
  try {
    const store = await cookies();
    if (!store.getAll().some((c) => c.name.startsWith('sb-') && c.name.includes('-auth-token'))) return null;
    const supabase = await createSessionClient();
    // get_own_profile returns one users row, not a set: with no valid session
    // (an expired or garbled cookie) PostgREST sends a row of nulls, not null.
    const rpc = supabase.rpc('get_own_profile' as never).then(({ data, error }) => (error || !(data as AuthUser | null)?.id ? null : (data as AuthUser)));
    // The root layout waits on this before the first byte, so a slow database
    // must not hold the page shell: past the cap the browser fetches it itself.
    return await Promise.race([rpc, new Promise<null>((resolve) => setTimeout(() => resolve(null), PROFILE_WAIT_MS))]);
  } catch {
    return null;
  }
});
