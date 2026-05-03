// Holdings Database Operations
// Server-side database operations for user holdings

import { createServerClient } from '@/lib/supabase/client';
import type { UserHolding, InsertUserHolding, UpdateUserHolding } from '@/lib/types/database';
import { logger } from '@/lib/utils/logger';

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
      .select('id, user_id, symbol, company_name, quantity, avg_price, date_purchased, asset_type, source, brokerage_account_id, alerts_enabled, created_at, updated_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('Error fetching holdings:', error);
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
    logger.error('Error in getHoldings:', error);
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
        date_purchased: (holding as { date_purchased?: string | null }).date_purchased ?? null,
        asset_type: (holding as { asset_type?: string | null }).asset_type ?? 'stock',
      })
      .select()
      .single();

    if (insertError) {
      logger.error('Error adding holding:', insertError);
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
    logger.error('Error in addHolding:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    };
  }
}

/**
 * Add or update a holding — if the symbol already exists, adds to quantity (and optionally
 * updates avg_price with weighted average). Use for "add 5 more shares" semantics.
 */
export async function addOrUpdateHolding(
  userId: string,
  holding: Omit<InsertUserHolding, 'user_id'>
): Promise<AddHoldingResult> {
  try {
    const supabase = createServerClient();

    if (!holding.symbol || !holding.company_name) {
      return {
        success: false,
        error: 'Symbol and company name are required',
      };
    }

    const { data: existing } = await supabase
      .from('user_holdings')
      .select('id, quantity, avg_price')
      .eq('user_id', userId)
      .eq('symbol', holding.symbol.toUpperCase())
      .maybeSingle();

    if (existing) {
      const existingQty = existing.quantity ?? 0;
      const addQty = holding.quantity ?? 0;
      const newQuantity = existingQty + addQty;

      let newAvgPrice: number | null = existing.avg_price ?? null;
      if (holding.avg_price != null && holding.avg_price > 0 && addQty > 0) {
        if (existingQty > 0 && existing.avg_price != null) {
          newAvgPrice =
            (existingQty * existing.avg_price + addQty * holding.avg_price) / newQuantity;
        } else {
          newAvgPrice = holding.avg_price;
        }
      }

      const { data: updated, error } = await supabase
        .from('user_holdings')
        .update({
          quantity: newQuantity,
          avg_price: newAvgPrice,
          company_name: holding.company_name,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .eq('user_id', userId)
        .select()
        .single();

      if (error) {
        return { success: false, error: error.message };
      }
      return { success: true, holding: updated as UserHolding };
    }

    return addHolding(userId, holding);
  } catch (error) {
    logger.error('Error in addOrUpdateHolding:', error);
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
    if ('date_purchased' in updates) updateData.date_purchased = (updates as { date_purchased?: string | null }).date_purchased ?? null;

    // Update holding
    const { data: updated, error: updateError } = await supabase
      .from('user_holdings')
      .update(updateData)
      .eq('id', holdingId)
      .eq('user_id', userId) // Double-check ownership
      .select()
      .single();

    if (updateError) {
      logger.error('Error updating holding:', updateError);
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
    logger.error('Error in updateHolding:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    };
  }
}

/**
 * Update a holding identified by ticker symbol.
 * Always scoped to the given userId — ownership is enforced at query level.
 */
export async function updateHoldingBySymbol(
  userId: string,
  symbol: string,
  updates: { quantity?: number | null; avg_price?: number | null }
): Promise<UpdateHoldingResult> {
  try {
    const supabase = createServerClient();
    const upperSymbol = symbol.toUpperCase();

    const { data: existing, error: lookupErr } = await supabase
      .from('user_holdings')
      .select('id')
      .eq('user_id', userId)
      .eq('symbol', upperSymbol)
      .maybeSingle();

    if (lookupErr || !existing) {
      return { success: false, error: `No holding found for ${upperSymbol}` };
    }

    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (updates.quantity !== undefined) updateData.quantity = updates.quantity;
    if (updates.avg_price !== undefined) updateData.avg_price = updates.avg_price;

    const { data: updated, error: updateErr } = await supabase
      .from('user_holdings')
      .update(updateData)
      .eq('id', existing.id)
      .eq('user_id', userId) // second ownership check
      .select()
      .single();

    if (updateErr) {
      return { success: false, error: updateErr.message };
    }
    return { success: true, holding: updated as UserHolding };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Internal server error' };
  }
}

/**
 * Remove a holding identified by ticker symbol.
 * Always scoped to the given userId — ownership is enforced at query level.
 */
export async function removeHoldingBySymbol(
  userId: string,
  symbol: string
): Promise<RemoveHoldingResult> {
  try {
    const supabase = createServerClient();
    const upperSymbol = symbol.toUpperCase();

    // Verify the holding belongs to this user before deleting
    const { data: existing, error: lookupErr } = await supabase
      .from('user_holdings')
      .select('id')
      .eq('user_id', userId)
      .eq('symbol', upperSymbol)
      .maybeSingle();

    if (lookupErr || !existing) {
      return { success: false, error: `No holding found for ${upperSymbol}` };
    }

    const { error: deleteErr } = await supabase
      .from('user_holdings')
      .delete()
      .eq('id', existing.id)
      .eq('user_id', userId); // enforces ownership

    if (deleteErr) {
      return { success: false, error: deleteErr.message };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Internal server error' };
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
      logger.error('Error removing holding:', deleteError);
      return {
        success: false,
        error: deleteError.message || 'Failed to remove holding',
      };
    }

    return {
      success: true,
    };
  } catch (error) {
    logger.error('Error in removeHolding:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    };
  }
}