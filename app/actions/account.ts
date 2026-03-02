'use server';

import { createServerClient } from '@/lib/supabase/client';
import { createClient } from '@supabase/supabase-js';

/**
 * Deletes all user data from Supabase and then removes the auth user.
 * Must run server-side because deleting auth users requires the service role key.
 */
export async function deleteAccount(userId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = createServerClient();

    // Delete user data (cascade handles related rows if FK is set up, but be explicit)
    const { error: holdingsError } = await supabase
      .from('user_holdings')
      .delete()
      .eq('user_id', userId);

    if (holdingsError) {
      return { success: false, error: `Failed to delete holdings: ${holdingsError.message}` };
    }

    const { error: userError } = await supabase
      .from('users')
      .delete()
      .eq('id', userId);

    if (userError) {
      return { success: false, error: `Failed to delete user profile: ${userError.message}` };
    }

    // Delete the auth user — requires service role key
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

    if (!serviceRoleKey || !supabaseUrl) {
      return { success: false, error: 'Server configuration error: missing service role key' };
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { error: authError } = await adminClient.auth.admin.deleteUser(userId);

    if (authError) {
      return { success: false, error: `Failed to delete auth user: ${authError.message}` };
    }

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error during account deletion',
    };
  }
}

/**
 * Fetches all exportable data for a user and returns it as a plain object.
 */
export async function exportUserData(userId: string): Promise<{
  success: boolean;
  data?: object;
  error?: string;
}> {
  try {
    const supabase = createServerClient();

    const [profileResult, holdingsResult] = await Promise.all([
      supabase.from('users').select('*').eq('id', userId).single(),
      supabase.from('user_holdings').select('*').eq('user_id', userId),
    ]);

    if (profileResult.error) {
      return { success: false, error: profileResult.error.message };
    }

    return {
      success: true,
      data: {
        exportedAt: new Date().toISOString(),
        profile: profileResult.data,
        holdings: holdingsResult.data ?? [],
      },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error during data export',
    };
  }
}
