'use server';

// Server Actions for Holdings
// Server-side mutations for user holdings with authentication

import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';
import { getHoldings, addHolding, updateHolding, removeHolding } from '@/lib/holdings/holdings-db';
import type { UserHolding } from '@/lib/types/database';

/**
 * Get authenticated user ID from Supabase session in Server Actions
 * Uses cookies to access the session
 */
async function getCurrentUserId(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      console.error('Missing Supabase environment variables');
      return null;
    }

    // Create a client with cookies for Server Actions
    const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
      },
    });

    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (error || !session?.user) {
      return null;
    }
    
    return session.user.id;
  } catch (error) {
    console.error('Error getting current user:', error);
    return null;
  }
}

export interface AddHoldingInput {
  symbol: string;
  company_name: string;
  quantity?: number | null;
  avg_price?: number | null;
}

export interface UpdateHoldingInput {
  symbol?: string;
  company_name?: string;
  quantity?: number | null;
  avg_price?: number | null;
}

/**
 * Server Action: Get all holdings for a user
 * Note: userId must be passed from authenticated client session
 */
export async function getMyHoldings(userId: string): Promise<{
  success: boolean;
  holdings?: UserHolding[];
  error?: string;
}> {
  if (!userId) {
    return {
      success: false,
      error: 'User ID is required',
    };
  }

  return await getHoldings(userId);
}

/**
 * Server Action: Add a new holding
 * Note: userId must be passed from authenticated client session
 */
export async function addHoldingAction(
  userId: string,
  input: AddHoldingInput
): Promise<{
  success: boolean;
  holding?: UserHolding;
  error?: string;
}> {
  if (!userId) {
    return {
      success: false,
      error: 'User ID is required',
    };
  }

  // Validate input
  if (!input.symbol || !input.company_name) {
    return {
      success: false,
      error: 'Symbol and company name are required',
    };
  }

  return await addHolding(userId, {
    symbol: input.symbol,
    company_name: input.company_name,
    quantity: input.quantity ?? null,
    avg_price: input.avg_price ?? null,
  });
}

/**
 * Server Action: Update an existing holding
 * Note: userId must be passed from authenticated client session
 */
export async function updateHoldingAction(
  userId: string,
  holdingId: string,
  updates: UpdateHoldingInput
): Promise<{
  success: boolean;
  holding?: UserHolding;
  error?: string;
}> {
  if (!userId) {
    return {
      success: false,
      error: 'User ID is required',
    };
  }

  if (!holdingId) {
    return {
      success: false,
      error: 'Holding ID is required',
    };
  }

  return await updateHolding(userId, holdingId, updates);
}

/**
 * Server Action: Remove a holding
 * Note: userId must be passed from authenticated client session
 */
export async function removeHoldingAction(
  userId: string,
  holdingId: string
): Promise<{
  success: boolean;
  error?: string;
}> {
  if (!userId) {
    return {
      success: false,
      error: 'User ID is required',
    };
  }

  if (!holdingId) {
    return {
      success: false,
      error: 'Holding ID is required',
    };
  }

  return await removeHolding(userId, holdingId);
}