/**
 * Server-side session utilities for Server Actions
 * Resolves the authenticated user from cookies — never trust client-provided userId.
 */

import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import type { Database } from '@/lib/supabase/types';

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
 * Uses cookies to access the session. Returns null if not authenticated.
 */
export async function getCurrentUserId(): Promise<string | null> {
  try {
    const supabase = await createSessionClient();
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();

    if (error || !session?.user) {
      return null;
    }

    return session.user.id;
  } catch {
    return null;
  }
}
