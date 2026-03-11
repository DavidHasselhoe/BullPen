'use server';

// Server Actions for Holdings
// Server-side mutations for user holdings with authentication

import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';
import { getHoldings, addHolding, addOrUpdateHolding, updateHolding, removeHolding, updateHoldingBySymbol, removeHoldingBySymbol } from '@/lib/holdings/holdings-db';
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
 * Server Action: Add or update a holding — adds to existing quantity if symbol already in portfolio.
 * Use for AI-driven "add 5 NVIDIA" when user may already have NVIDIA.
 */
export async function addOrUpdateHoldingAction(
  userId: string,
  input: AddHoldingInput
): Promise<{
  success: boolean;
  holding?: UserHolding;
  error?: string;
}> {
  if (!userId) {
    return { success: false, error: 'User ID is required' };
  }
  if (!input.symbol || !input.company_name) {
    return { success: false, error: 'Symbol and company name are required' };
  }

  return await addOrUpdateHolding(userId, {
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
 * Server Action: Update a holding by ticker symbol.
 * Ownership is enforced inside updateHoldingBySymbol via user_id filter.
 */
export async function updateHoldingBySymbolAction(
  userId: string,
  symbol: string,
  updates: { quantity?: number | null; avg_price?: number | null }
): Promise<{
  success: boolean;
  holding?: UserHolding;
  error?: string;
}> {
  if (!userId) return { success: false, error: 'Authentication required' };
  if (!symbol) return { success: false, error: 'Symbol is required' };
  if (updates.quantity !== undefined && updates.quantity !== null && updates.quantity < 0) {
    return { success: false, error: 'Quantity cannot be negative' };
  }
  if (updates.avg_price !== undefined && updates.avg_price !== null && updates.avg_price < 0) {
    return { success: false, error: 'Average price cannot be negative' };
  }
  return updateHoldingBySymbol(userId, symbol, updates);
}

/**
 * Server Action: Remove a holding by ticker symbol.
 * Ownership is enforced inside removeHoldingBySymbol via user_id filter.
 */
export async function removeHoldingBySymbolAction(
  userId: string,
  symbol: string
): Promise<{
  success: boolean;
  error?: string;
}> {
  if (!userId) return { success: false, error: 'Authentication required' };
  if (!symbol) return { success: false, error: 'Symbol is required' };
  return removeHoldingBySymbol(userId, symbol);
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