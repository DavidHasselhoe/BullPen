// Holdings Database Operations
// Server-side database operations for user holdings

import { createServerClient } from '@/lib/supabase/client';
import type { UserHolding, InsertUserHolding, UpdateUserHolding } from '@/lib/types/database';

export interface GetHoldingsResult {
  success: boolean;
  holdings?: UserHolding[];
  error?: string;
}

export interface AddHoldingResult {
  success: boolean;
  holding?: UserHolding;
  error?: string;
}

export interface UpdateHoldingResult {
  success: boolean;
  holding?: UserHolding;
  error?: string;
}

export interface RemoveHoldingResult {
  success: boolean;
  error?: string;
}

/**
 * Get all holdings for a user
 */
export async function getHoldings(userId: string): Promise<GetHoldingsResult> {
  try {
    const supabase = createServerClient();

    const { data: holdings, error } = await supabase
      .from('user_holdings')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching holdings:', error);
      return {
        success: false,
        error: error.message || 'Failed to fetch holdings',
      };
    }

    return {
      success: true,
      holdings: holdings as UserHolding[],
    };
  } catch (error) {
    console.error('Error in getHoldings:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    };
  }
}

/**
 * Add a new holding for a user
 */
export async function addHolding(
  userId: string,
  holding: Omit<InsertUserHolding, 'user_id'>
): Promise<AddHoldingResult> {
  try {
    const supabase = createServerClient();

    // Validate input
    if (!holding.symbol || !holding.company_name) {
      return {
        success: false,
        error: 'Symbol and company name are required',
      };
    }

    // Check if holding already exists (unique constraint on user_id, symbol)
    const { data: existing, error: checkError } = await supabase
      .from('user_holdings')
      .select('id')
      .eq('user_id', userId)
      .eq('symbol', holding.symbol.toUpperCase())
      .single();

    if (existing) {
      return {
        success: false,
        error: 'Holding already exists for this stock',
      };
    }

    // Insert new holding
    const { data: newHolding, error: insertError } = await supabase
      .from('user_holdings')
      .insert({
        user_id: userId,
        symbol: holding.symbol.toUpperCase(),
        company_name: holding.company_name,
        quantity: holding.quantity || null,
        avg_price: holding.avg_price || null,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error adding holding:', insertError);
      return {
        success: false,
        error: insertError.message || 'Failed to add holding',
      };
    }

    return {
      success: true,
      holding: newHolding as UserHolding,
    };
  } catch (error) {
    console.error('Error in addHolding:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    };
  }
}

/**
 * Update an existing holding
 */
export async function updateHolding(
  userId: string,
  holdingId: string,
  updates: Omit<UpdateUserHolding, 'id'>
): Promise<UpdateHoldingResult> {
  try {
    const supabase = createServerClient();

    // Verify ownership
    const { data: existing, error: checkError } = await supabase
      .from('user_holdings')
      .select('id')
      .eq('id', holdingId)
      .eq('user_id', userId)
      .single();

    if (checkError || !existing) {
      return {
        success: false,
        error: 'Holding not found or access denied',
      };
    }

    // Build update object (only include defined fields)
    const updateData: Partial<InsertUserHolding> = {};
    if (updates.symbol !== undefined) updateData.symbol = updates.symbol.toUpperCase();
    if (updates.company_name !== undefined) updateData.company_name = updates.company_name;
    if (updates.quantity !== undefined) updateData.quantity = updates.quantity;
    if (updates.avg_price !== undefined) updateData.avg_price = updates.avg_price;

    // Update holding
    const { data: updated, error: updateError } = await supabase
      .from('user_holdings')
      .update(updateData)
      .eq('id', holdingId)
      .eq('user_id', userId) // Double-check ownership
      .select()
      .single();

    if (updateError) {
      console.error('Error updating holding:', updateError);
      return {
        success: false,
        error: updateError.message || 'Failed to update holding',
      };
    }

    return {
      success: true,
      holding: updated as UserHolding,
    };
  } catch (error) {
    console.error('Error in updateHolding:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    };
  }
}

/**
 * Remove a holding
 */
export async function removeHolding(
  userId: string,
  holdingId: string
): Promise<RemoveHoldingResult> {
  try {
    const supabase = createServerClient();

    // Verify ownership and delete
    const { error: deleteError } = await supabase
      .from('user_holdings')
      .delete()
      .eq('id', holdingId)
      .eq('user_id', userId); // RLS will ensure user can only delete their own

    if (deleteError) {
      console.error('Error removing holding:', deleteError);
      return {
        success: false,
        error: deleteError.message || 'Failed to remove holding',
      };
    }

    return {
      success: true,
    };
  } catch (error) {
    console.error('Error in removeHolding:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    };
  }
}