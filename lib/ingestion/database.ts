// Database Operations for Ingestion Pipeline
// Type-safe operations for inserting filings and sections

import { createServerClient } from '../supabase/client';
import type {
  Company,
  Filing,
  FilingSection,
  FilingType,
  ProcessingStatus,
  InsertFiling,
  InsertFilingSection,
} from '../types/database';
import type { ParsedSection } from './filing-parser';

/**
 * Result of database operations
 */
export interface DatabaseResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Gets or creates a company in the database
 * Returns existing company if found by CIK, creates new one if not
 */
export async function getOrCreateCompany(params: {
  ticker: string;
  name: string;
  cik: string;
  sector?: string;
  industry?: string;
}): Promise<DatabaseResult<Company>> {
  const supabase = createServerClient();

  try {
    // Try to find existing company by CIK
    const { data: existing, error: findError } = await supabase
      .from('companies')
      .select('*')
      .eq('cik', params.cik)
      .single();

    if (existing) {
      return { success: true, data: existing };
    }

    // Create new company if not found
    const { data: newCompany, error: createError } = await supabase
      .from('companies')
      .insert({
        ticker: params.ticker,
        name: params.name,
        cik: params.cik,
        sector: params.sector || null,
        industry: params.industry || null,
        description: null,
        metadata: {},
      })
      .select()
      .single();

    if (createError) {
      return { success: false, error: createError.message };
    }

    // Extract and update company profile data asynchronously (don't block creation)
    // Profile extraction can happen in background after company is created
    if (newCompany) {
      // Extract profile data in background (fire and forget)
      extractCompanyProfile(params.cik, newCompany.id)
        .then((profileData) => {
          updateCompanyProfile(newCompany.id, profileData).catch((err) => {
            console.error(`Error updating company profile for ${params.ticker}:`, err);
          });
        })
        .catch((err) => {
          console.error(`Error extracting company profile for ${params.ticker}:`, err);
        });

      // Fetch and store logo in background (fire and forget)
      import('../logos/logos-orchestrator')
        .then(({ ingestCompanyLogo }) => {
          ingestCompanyLogo(params.ticker, params.name, newCompany.id).catch((err) => {
            console.error(`Error ingesting logo for ${params.ticker}:`, err);
          });
        })
        .catch((err) => {
          console.error(`Error loading logo orchestrator for ${params.ticker}:`, err);
        });
    }

    return { success: true, data: newCompany };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Checks if a filing already exists by accession number
 */
export async function filingExists(accessionNumber: string): Promise<boolean> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('filings')
    .select('id')
    .eq('accession_number', accessionNumber)
    .single();

  return !error && data !== null;
}

/**
 * Creates a new filing record
 */
export async function createFiling(params: {
  companyId: string;
  filingType: FilingType;
  accessionNumber: string;
  filingDate: string;
  acceptedDate?: string | null;
  periodEndDate?: string;
  periodType?: 'annual' | 'quarterly' | 'ttm' | 'ytd' | null;
  fiscalYear?: number;
  fiscalQuarter?: number;
  items?: string[];
  sourceUrl: string;
  documentUrl?: string;
  metadata?: Record<string, unknown>;
}): Promise<DatabaseResult<Filing>> {
  const supabase = createServerClient();

  try {
    const filingData: InsertFiling = {
      company_id: params.companyId,
      filing_type: params.filingType,
      accession_number: params.accessionNumber,
      filing_date: params.filingDate,
      accepted_date: params.acceptedDate || null,
      period_end_date: params.periodEndDate || null,
      period_type: params.periodType || null,
      fiscal_year: params.fiscalYear || null,
      fiscal_quarter: params.fiscalQuarter || null,
      items: params.items || [],
      source_url: params.sourceUrl,
      document_url: params.documentUrl || null,
      processing_status: 'processing',
      processing_error: null,
      metadata: params.metadata || {},
    };

    const { data, error } = await supabase
      .from('filings')
      .insert(filingData)
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Updates filing processing status
 */
export async function updateFilingStatus(
  filingId: string,
  status: ProcessingStatus,
  errorMessage?: string
): Promise<DatabaseResult<Filing>> {
  const supabase = createServerClient();

  try {
    const { data, error } = await supabase
      .from('filings')
      .update({
        processing_status: status,
        processing_error: errorMessage || null,
      })
      .eq('id', filingId)
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Creates filing sections in bulk
 */
export async function createFilingSections(
  filingId: string,
  sections: ParsedSection[]
): Promise<DatabaseResult<FilingSection[]>> {
  const supabase = createServerClient();

  try {
    const sectionsData: InsertFilingSection[] = sections.map((section) => ({
      filing_id: filingId,
      section_type: section.type,
      section_name: section.name,
      content: section.content,
      content_length: section.content.length,
      section_order: section.order,
      metadata: {},
    }));

    const { data, error } = await supabase
      .from('filing_sections')
      .insert(sectionsData)
      .select();

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
 * Gets a company by ticker
 */
export async function getCompanyByTicker(
  ticker: string
): Promise<DatabaseResult<Company>> {
  const supabase = createServerClient();

  try {
    const { data, error } = await supabase
      .from('companies')
      .select('*')
      .eq('ticker', ticker)
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Gets a company by CIK
 */
export async function getCompanyByCIK(cik: string): Promise<DatabaseResult<Company>> {
  const supabase = createServerClient();

  try {
    const { data, error } = await supabase
      .from('companies')
      .select('*')
      .eq('cik', cik)
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Gets recent filings for a company
 */
export async function getCompanyFilings(
  companyId: string,
  limit: number = 10
): Promise<DatabaseResult<Filing[]>> {
  const supabase = createServerClient();

  try {
    const { data, error } = await supabase
      .from('filings')
      .select('*')
      .eq('company_id', companyId)
      .order('filing_date', { ascending: false })
      .limit(limit);

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
 * Gets filing with all sections
 */
export async function getFilingWithSections(
  filingId: string
): Promise<DatabaseResult<Filing & { sections: FilingSection[] }>> {
  const supabase = createServerClient();

  try {
    const { data, error } = await supabase
      .from('filings')
      .select('*, filing_sections(*)')
      .eq('id', filingId)
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: data as any };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Gets filings for a company by fiscal period
 * Used for 10-Q precedence checking in Phase B
 */
export async function getCompanyFilingsByPeriod(
  companyId: string,
  filingType: FilingType,
  fiscalYear: number,
  fiscalQuarter: number | null
): Promise<DatabaseResult<Filing[]>> {
  const supabase = createServerClient();

  try {
    let query = supabase
      .from('filings')
      .select('*')
      .eq('company_id', companyId)
      .eq('filing_type', filingType)
      .eq('fiscal_year', fiscalYear);

    if (fiscalQuarter !== null) {
      query = query.eq('fiscal_quarter', fiscalQuarter);
    }

    const { data, error } = await query;

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
 * Deletes a filing and all associated sections (cascade)
 */
export async function deleteFiling(filingId: string): Promise<DatabaseResult<void>> {
  const supabase = createServerClient();

  try {
    const { error } = await supabase.from('filings').delete().eq('id', filingId);

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
