// Search Database Functions
// Handles company search and autocomplete

import { createServerClient } from '../supabase/client';
import type { CompanyIndex } from '../types/database';

export interface SearchResult {
  ticker: string;
  name: string;
  cik: string;
  has_data: boolean;
}

export interface SearchDBResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Searches company index with fuzzy matching
 * Matches on ticker (prefix) and name (fuzzy)
 */
export async function searchCompanies(
  query: string,
  limit: number = 15
): Promise<SearchDBResult<SearchResult[]>> {
  const supabase = createServerClient();

  if (!query || query.trim().length === 0) {
    return { success: true, data: [] };
  }

  const normalizedQuery = query.trim().toLowerCase();
  const normalizedQueryPattern = `${normalizedQuery}%`;

  try {
    // Search on normalized ticker (prefix match) and normalized name (fuzzy match)
    // Use separate queries and combine for better reliability
    const { data: tickerData, error: tickerError } = await supabase
      .from('company_index')
      .select('ticker, name, cik, has_data')
      .ilike('normalized_ticker', normalizedQueryPattern)
      .limit(limit);

    const { data: nameData, error: nameError } = await supabase
      .from('company_index')
      .select('ticker, name, cik, has_data')
      .ilike('normalized_name', `%${normalizedQuery}%`)
      .limit(limit);

    if (tickerError) {
      // Check if table doesn't exist
      const errorMsg = tickerError.message || '';
      if (errorMsg.includes('does not exist') || tickerError.code === '42P01' || tickerError.code === 'PGRST204') {
        return { 
          success: false, 
          error: 'company_index table does not exist. Please run: supabase db push (to apply migration) then npm run bootstrap-company-index (to populate data)' 
        };
      }
      return { success: false, error: tickerError.message || 'Search failed' };
    }

    if (nameError) {
      // Check if table doesn't exist
      const errorMsg = nameError.message || '';
      if (errorMsg.includes('does not exist') || nameError.code === '42P01' || nameError.code === 'PGRST204') {
        return { 
          success: false, 
          error: 'company_index table does not exist. Please run: supabase db push (to apply migration) then npm run bootstrap-company-index (to populate data)' 
        };
      }
      return { success: false, error: nameError.message || 'Search failed' };
    }

    // Combine and deduplicate results
    const combined = [
      ...(tickerData || []),
      ...(nameData || []),
    ];

    // Deduplicate by ticker
    const uniqueMap = new Map<string, SearchResult>();
    combined.forEach((item) => {
      if (!uniqueMap.has(item.ticker)) {
        uniqueMap.set(item.ticker, {
          ticker: item.ticker,
          name: item.name,
          cik: item.cik,
          has_data: item.has_data || false,
        });
      }
    });

    const results = Array.from(uniqueMap.values());

    // Sort: exact ticker match first, then prefix ticker matches, then name matches
    const sortedResults = results.sort((a, b) => {
      const aTickerLower = a.ticker.toLowerCase();
      const bTickerLower = b.ticker.toLowerCase();

      // Exact ticker match
      if (aTickerLower === normalizedQuery && bTickerLower !== normalizedQuery) return -1;
      if (bTickerLower === normalizedQuery && aTickerLower !== normalizedQuery) return 1;

      // Ticker prefix match
      const aTickerPrefix = aTickerLower.startsWith(normalizedQuery);
      const bTickerPrefix = bTickerLower.startsWith(normalizedQuery);
      if (aTickerPrefix && !bTickerPrefix) return -1;
      if (bTickerPrefix && !aTickerPrefix) return 1;

      // Then by has_data
      if (a.has_data && !b.has_data) return -1;
      if (b.has_data && !a.has_data) return 1;

      // Finally alphabetical
      return a.ticker.localeCompare(b.ticker);
    });

    // Limit results
    const limitedResults = sortedResults.slice(0, limit);

    return { success: true, data: limitedResults };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Gets company index entry by ticker
 */
export async function getCompanyIndexByTicker(
  ticker: string
): Promise<SearchDBResult<CompanyIndex | null>> {
  const supabase = createServerClient();

  try {
    const { data, error } = await supabase
      .from('company_index')
      .select('*')
      .eq('ticker', ticker.toUpperCase())
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // Not found
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

/**
 * Updates company index to mark data as ingested
 */
export async function markCompanyIndexAsIngested(
  ticker: string
): Promise<SearchDBResult<void>> {
  const supabase = createServerClient();

  try {
    const { error } = await supabase
      .from('company_index')
      .update({
        has_data: true,
        last_ingested_at: new Date().toISOString(),
      })
      .eq('ticker', ticker.toUpperCase());

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
