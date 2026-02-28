// Stock Splits Database Operations
// Functions for creating and querying stock splits

import { createServerClient } from '../supabase/client';

/**
 * Result of database operations
 */
export interface DatabaseResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface StockSplitRecord {
  id: string;
  company_id: string;
  split_ratio: number;
  effective_date: string;
  source: string;
  source_reference: string | null;
  description: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface InsertStockSplit {
  company_id: string;
  split_ratio: number;
  effective_date: string;
  source: string;
  source_reference?: string | null;
  description?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Creates a stock split record
 */
export async function createStockSplit(
  params: InsertStockSplit
): Promise<DatabaseResult<StockSplitRecord>> {
  const supabase = createServerClient();

  try {
    const splitData = {
      company_id: params.company_id,
      split_ratio: params.split_ratio,
      effective_date: params.effective_date,
      source: params.source,
      source_reference: params.source_reference || null,
      description: params.description || null,
      metadata: params.metadata || {},
    };

    const { data, error } = await supabase
      .from('stock_splits')
      .insert(splitData)
      .select()
      .single();

    if (error) {
      // If duplicate, return existing record
      if (error.code === '23505') {
        const { data: existing } = await supabase
          .from('stock_splits')
          .select()
          .eq('company_id', params.company_id)
          .eq('effective_date', params.effective_date)
          .eq('split_ratio', params.split_ratio)
          .single();

        if (existing) {
          return { success: true, data: existing };
        }
      }
      return { success: false, error: error.message };
    }

    return { success: true, data: data! };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Gets stock splits for a company
 * Returns splits ordered by effective_date (newest first)
 */
export async function getStockSplits(
  companyId: string
): Promise<DatabaseResult<StockSplitRecord[]>> {
  const supabase = createServerClient();

  try {
    const { data, error } = await supabase
      .from('stock_splits')
      .select('*')
      .eq('company_id', companyId)
      .order('effective_date', { ascending: false });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: data || [] };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Gets stock splits for a company by ticker
 */
export async function getStockSplitsByTicker(
  ticker: string
): Promise<DatabaseResult<StockSplitRecord[]>> {
  const supabase = createServerClient();

  try {
    const { data, error } = await supabase
      .from('stock_splits')
      .select('*, companies!inner(ticker)')
      .eq('companies.ticker', ticker)
      .order('effective_date', { ascending: false });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: data || [] };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Deletes all stock splits for a company (for hard reset)
 */
export async function deleteStockSplits(
  companyId: string
): Promise<DatabaseResult<void>> {
  const supabase = createServerClient();

  try {
    const { error } = await supabase
      .from('stock_splits')
      .delete()
      .eq('company_id', companyId);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
