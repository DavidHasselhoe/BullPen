// Hard Reset Utility
// Phase 1: Destructive reset to delete filings and metrics for re-ingestion

import { createServerClient } from '../supabase/client';
import { deleteStockSplits } from './splits-db';

/**
 * Result of hard reset operation
 */
export interface HardResetResult {
  success: boolean;
  deletedFilings?: number;
  deletedMetrics?: number;
  error?: string;
}

/**
 * Deletes all filings and metrics for a company
 * Preserves: company record, fiscal calendar metadata, identifiers
 * 
 * WARNING: This is a destructive operation. Use with caution.
 */
export async function hardResetCompany(
  companyId: string
): Promise<HardResetResult> {
  const supabase = createServerClient();

  try {
    // Get filing IDs before deletion (for counting)
    const { data: filings, error: filingsError } = await supabase
      .from('filings')
      .select('id')
      .eq('company_id', companyId);

    if (filingsError) {
      return { success: false, error: `Failed to fetch filings: ${filingsError.message}` };
    }

    const filingIds = filings?.map(f => f.id) || [];
    const filingCount = filingIds.length;

    // Count metrics before deletion
    const { count: metricsCount, error: metricsCountError } = await supabase
      .from('financial_metrics')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', companyId);

    if (metricsCountError) {
      return { success: false, error: `Failed to count metrics: ${metricsCountError.message}` };
    }

    // Delete metrics (cascade from filings will handle most, but delete directly too)
    const { error: metricsError } = await supabase
      .from('financial_metrics')
      .delete()
      .eq('company_id', companyId);

    if (metricsError) {
      return { success: false, error: `Failed to delete metrics: ${metricsError.message}` };
    }

    // Delete filings (cascade will delete sections, insights, etc.)
    const { error: filingsDeleteError } = await supabase
      .from('filings')
      .delete()
      .eq('company_id', companyId);

    if (filingsDeleteError) {
      return { success: false, error: `Failed to delete filings: ${filingsDeleteError.message}` };
    }

    return {
      success: true,
      deletedFilings: filingCount,
      deletedMetrics: metricsCount || 0,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Deletes all filings and metrics for multiple companies (e.g., S&P 500)
 * 
 * WARNING: This is a destructive operation. Use with caution.
 */
export async function hardResetCompanies(
  companyIds: string[]
): Promise<HardResetResult & { companiesProcessed: number; errors: string[] }> {
  const results = {
    success: true,
    deletedFilings: 0,
    deletedMetrics: 0,
    companiesProcessed: 0,
    errors: [] as string[],
  };

  for (const companyId of companyIds) {
    const result = await hardResetCompany(companyId);
    if (result.success) {
      results.deletedFilings += result.deletedFilings || 0;
      results.deletedMetrics += result.deletedMetrics || 0;
      results.companiesProcessed++;
    } else {
      results.success = false;
      results.errors.push(`${companyId}: ${result.error}`);
    }
  }

  return results;
}

/**
 * Deletes all filings and metrics for companies by ticker (e.g., S&P 500 tickers)
 */
export async function hardResetByTickers(
  tickers: string[]
): Promise<HardResetResult & { companiesProcessed: number; errors: string[] }> {
  const supabase = createServerClient();

  try {
    // Get company IDs for tickers
    const { data: companies, error: companiesError } = await supabase
      .from('companies')
      .select('id')
      .in('ticker', tickers);

    if (companiesError) {
      return {
        success: false,
        error: `Failed to fetch companies: ${companiesError.message}`,
        companiesProcessed: 0,
        errors: [],
      };
    }

    if (!companies || companies.length === 0) {
      return {
        success: true,
        deletedFilings: 0,
        deletedMetrics: 0,
        companiesProcessed: 0,
        errors: [],
      };
    }

    const companyIds = companies.map(c => c.id);
    return await hardResetCompanies(companyIds);
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      companiesProcessed: 0,
      errors: [],
    };
  }
}
