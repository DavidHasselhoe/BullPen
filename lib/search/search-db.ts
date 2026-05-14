// Search Database Functions
// Handles company lookup for buy-here and other tools

import { createServerClient } from '../supabase/client';
import type { CompanyIndex } from '../types/database';

export interface SearchDBResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Gets company index entry by ticker (used to validate tickers exist)
 */
export async function getCompanyIndexByTicker(
  ticker: string
): Promise<SearchDBResult<CompanyIndex | null>> {
  const supabase = createServerClient();

  try {
    const { data, error } = await supabase
      .from('company_index')
      .select('ticker, name, cik, normalized_ticker, normalized_name')
      .eq('ticker', ticker.toUpperCase())
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return { success: true, data: null };
      }
      return { success: false, error: error.message };
    }

    return { success: true, data: data as CompanyIndex };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
