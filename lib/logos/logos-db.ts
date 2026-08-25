// Logo Database Operations
// Stores and retrieves logo metadata and URLs

import { createServerClient } from '../supabase/client';

export interface LogoMetadata {
  logo_url: string | null;
  logo_source: 'brand' | 'logo.dev' | 'wikipedia' | 'manual' | null;
  logo_updated_at: string | null;
}

/**
 * Updates company logo metadata in database
 */
export async function updateCompanyLogo(
  companyId: string,
  logoUrl: string,
  source: 'brand' | 'logo.dev' | 'wikipedia' | 'manual'
): Promise<{ success: boolean; error?: string }> {
  const supabase = createServerClient();

  try {
    const { error } = await supabase
      .from('companies')
      .update({
        logo_url: logoUrl,
        logo_source: source,
        logo_updated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', companyId);

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

/**
 * Gets company logo metadata
 */
export async function getCompanyLogo(companyId: string): Promise<{
  success: boolean;
  logo?: LogoMetadata;
  error?: string;
}> {
  const supabase = createServerClient();

  try {
    const { data, error } = await supabase
      .from('companies')
      .select('logo_url, logo_source, logo_updated_at')
      .eq('id', companyId)
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    if (!data) {
      return { success: false, error: 'Company not found' };
    }

    return {
      success: true,
      logo: {
        logo_url: data.logo_url,
        logo_source: data.logo_source as 'brand' | 'logo.dev' | 'wikipedia' | 'manual' | null,
        logo_updated_at: data.logo_updated_at,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Gets all companies that need logos (missing logo_url)
 */
export async function getCompaniesNeedingLogos(limit?: number): Promise<{
  success: boolean;
  companies?: Array<{ id: string; ticker: string; name: string }>;
  error?: string;
}> {
  const supabase = createServerClient();

  try {
    let query = supabase
      .from('companies')
      .select('id, ticker, name')
      .is('logo_url', null)
      .order('created_at', { ascending: false });

    if (limit) {
      query = query.limit(limit);
    }

    const { data, error } = await query;

    if (error) {
      return { success: false, error: error.message };
    }

    return {
      success: true,
      companies: data as Array<{ id: string; ticker: string; name: string }>,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
