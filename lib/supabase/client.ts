// Supabase Client Utilities
// Type-safe database access for BullPen

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';

// Singleton browser client instance
let browserClient: SupabaseClient<Database> | null = null;

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

  // Create client with proper session persistence and token refresh
  browserClient = createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  });

  return browserClient;
}

// Server-side Supabase client (uses service role for admin operations)
export function createServerClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error('Missing Supabase service role environment variables');
  }

  return createClient<Database>(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
