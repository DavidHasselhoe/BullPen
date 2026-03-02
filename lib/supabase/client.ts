// Supabase Client Utilities
// Type-safe database access for BullPen

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';

// Singleton browser client instance
let browserClient: SupabaseClient<Database> | null = null;

// Singleton server client instance (service role — no session, no auth refresh)
let serverClient: SupabaseClient<Database> | null = null;

// Client-side Supabase client (uses anon key)
// Returns a singleton instance to ensure session consistency
export function createBrowserClient(): SupabaseClient<Database> {
  // Return existing instance if available
  if (browserClient) {
    return browserClient;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase environment variables');
  }

  browserClient = createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      // Disabled: we explicitly call exchangeCodeForSession in /auth/callback.
      // Auto-detection can race and trigger "signal is aborted" in production.
      detectSessionInUrl: false,
      flowType: 'pkce',
    },
  });

  return browserClient;
}

// Server-side Supabase client (uses service role for admin operations)
// Returns a singleton to avoid spawning a new connection on every API call.
export function createServerClient(): SupabaseClient<Database> {
  if (serverClient) return serverClient;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error('Missing Supabase service role environment variables');
  }

  serverClient = createClient<Database>(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return serverClient;
}
