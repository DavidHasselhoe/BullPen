import { NextRequest, NextResponse } from 'next/server';
import { getCompanyProfile, extractCompanyProfile, updateCompanyProfile } from '@/lib/company/company-profile';
import { createServerClient } from '@/lib/supabase/client';

/**
 * GET /api/company/[companyId]/profile
 * 
 * Gets company profile data
 * Returns cached profile if available, otherwise extracts and caches it
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ companyId: string }> }
) {
  try {
    const params = await context.params;
    const companyId = params.companyId;

    if (!companyId) {
      return NextResponse.json(
        { success: false, error: 'Company ID is required' },
        { status: 400 }
      );
    }

    // Check if profile data exists in database
    const existingProfile = await getCompanyProfile(companyId);

    if (existingProfile.success && existingProfile.profile) {
      // Check if profile is complete (has at least some key data)
      const hasKeyData = 
        existingProfile.profile.sic_code ||
        existingProfile.profile.sector ||
        existingProfile.profile.incorporation_location ||
        existingProfile.profile.fiscal_year_end ||
        existingProfile.profile.employee_count ||
        existingProfile.profile.shares_outstanding;

      if (hasKeyData) {
        // Return cached profile
        return NextResponse.json({
          success: true,
          profile: existingProfile.profile,
        });
      }
    }

    // Profile doesn't exist or is incomplete - extract it in background
    // Return immediately with empty profile, extraction happens async
    const supabase = createServerClient();
    const { data: company, error: companyError } = await supabase
      .from('companies')
      .select('id, cik')
      .eq('id', companyId)
      .single();

    if (companyError || !company) {
      return NextResponse.json(
        { success: false, error: 'Company not found' },
        { status: 404 }
      );
    }

    // Trigger extraction in background (fire and forget)
    const typedCompany = company as { id: string; cik: string };
    extractCompanyProfile(typedCompany.cik, companyId)
      .then((profileData) => {
        updateCompanyProfile(companyId, profileData).catch((err) => {
          console.error(`Error updating company profile for ${companyId}:`, err);
        });
      })
      .catch((err) => {
        console.error(`Error extracting company profile for ${companyId}:`, err);
      });

    // Return empty profile immediately (will be populated by background extraction)
    return NextResponse.json({
      success: true,
      profile: {
        sic_code: null,
        sector: null,
        industry: null,
        incorporation_location: null,
        fiscal_year_end: null,
        employee_count: null,
        employee_count_is_estimated: false,
        shares_outstanding: null,
      },
      extracting: true, // Flag to indicate extraction is in progress
    });
  } catch (error) {
    console.error('Error getting company profile:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
