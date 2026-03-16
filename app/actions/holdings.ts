'use server';

// Server Actions for Holdings
// Server-side mutations for user holdings with authentication

import { getCurrentUserId } from '@/lib/auth/server-session';
import { getHoldings, addHolding, addOrUpdateHolding, updateHolding, removeHolding, updateHoldingBySymbol, removeHoldingBySymbol } from '@/lib/holdings/holdings-db';
import type { UserHolding } from '@/lib/types/database';

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
 * Server Action: Get all holdings for a user.
 * userId from session only — never trust client-provided userId.
 */
export async function getMyHoldings(userId: string): Promise<{
  success: boolean;
  holdings?: UserHolding[];
  error?: string;
}> {
  const uid = await getCurrentUserId();
  if (!uid) return { success: false, error: 'Authentication required' };
  return await getHoldings(uid);
}

/**
 * Server Action: Add a new holding.
 * UserId is derived from session — never trusted from client.
 */
export async function addHoldingAction(
  _userId: string,
  input: AddHoldingInput
): Promise<{
  success: boolean;
  holding?: UserHolding;
  error?: string;
}> {
  const userId = await getCurrentUserId();
  if (!userId) return { success: false, error: 'Authentication required' };

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
 * userId from session only — never trust client-provided userId.
 */
export async function addOrUpdateHoldingAction(
  _userId: string,
  input: AddHoldingInput
): Promise<{
  success: boolean;
  holding?: UserHolding;
  error?: string;
}> {
  const uid = await getCurrentUserId();
  if (!uid) return { success: false, error: 'Authentication required' };
  if (!input.symbol || !input.company_name) {
    return { success: false, error: 'Symbol and company name are required' };
  }

  return await addOrUpdateHolding(uid, {
    symbol: input.symbol,
    company_name: input.company_name,
    quantity: input.quantity ?? null,
    avg_price: input.avg_price ?? null,
  });
}

/**
 * Server Action: Update an existing holding.
 * userId from session only — never trust client-provided userId.
 */
export async function updateHoldingAction(
  _userId: string,
  holdingId: string,
  updates: UpdateHoldingInput
): Promise<{
  success: boolean;
  holding?: UserHolding;
  error?: string;
}> {
  const uid = await getCurrentUserId();
  if (!uid) return { success: false, error: 'User ID is required' };

  if (!holdingId) {
    return {
      success: false,
      error: 'Holding ID is required',
    };
  }

  return await updateHolding(uid, holdingId, updates);
}

/**
 * Server Action: Update a holding by ticker symbol.
 * userId from session only — never trust client-provided userId.
 */
export async function updateHoldingBySymbolAction(
  _userId: string,
  symbol: string,
  updates: { quantity?: number | null; avg_price?: number | null }
): Promise<{
  success: boolean;
  holding?: UserHolding;
  error?: string;
}> {
  const uid = await getCurrentUserId();
  if (!uid) return { success: false, error: 'Authentication required' };
  if (!symbol) return { success: false, error: 'Symbol is required' };
  if (updates.quantity !== undefined && updates.quantity !== null && updates.quantity < 0) {
    return { success: false, error: 'Quantity cannot be negative' };
  }
  if (updates.avg_price !== undefined && updates.avg_price !== null && updates.avg_price < 0) {
    return { success: false, error: 'Average price cannot be negative' };
  }
  return updateHoldingBySymbol(uid, symbol, updates);
}

/**
 * Server Action: Remove a holding by ticker symbol.
 * userId from session only — never trust client-provided userId.
 */
export async function removeHoldingBySymbolAction(
  _userId: string,
  symbol: string
): Promise<{
  success: boolean;
  error?: string;
}> {
  const uid = await getCurrentUserId();
  if (!uid) return { success: false, error: 'Authentication required' };
  if (!symbol) return { success: false, error: 'Symbol is required' };
  return removeHoldingBySymbol(uid, symbol);
}

/**
 * Server Action: Remove a holding.
 * UserId is derived from session — never trusted from client.
 */
export async function removeHoldingAction(
  _userId: string,
  holdingId: string
): Promise<{
  success: boolean;
  error?: string;
}> {
  const userId = await getCurrentUserId();
  if (!userId) return { success: false, error: 'Authentication required' };
  if (!holdingId) {
    return {
      success: false,
      error: 'Holding ID is required',
    };
  }

  return await removeHolding(userId, holdingId);
}