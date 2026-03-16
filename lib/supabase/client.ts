// Supabase Client Utilities
// Type-safe database access for BullPen

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createBrowserClient as createSSRBrowserClient } from '@supabase/ssr';
import type { Database } from './types';

// Singleton browser client instance
let browserClient: SupabaseClient<Database> | null = null;

// Singleton server client instance (service role — no session, no auth refresh)
let serverClient: SupabaseClient<Database> | null = null;

// Client-side Supabase client (uses anon key)
// Uses @supabase/ssr so session is stored in cookies — required for Server Actions to read auth.
// In the browser, createBrowserClient from @supabase/ssr uses document.cookie by default.
export function createBrowserClient(): SupabaseClient<Database> {
  if (browserClient) return browserClient;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase environment variables');
  }

  browserClient = createSSRBrowserClient<Database>(supabaseUrl, supabaseAnonKey);
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
