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
        // Return cached profile (no extracting flag)
        return NextResponse.json({
          success: true,
          profile: existingProfile.profile,
        });
      }

      // Profile exists but has no data - extraction may have completed with no data
      // Check if we've already tried extraction (by checking if all fields are explicitly null)
      // If so, don't extract again - just return the empty profile
      const allNull = 
        existingProfile.profile.sic_code === null &&
        existingProfile.profile.sector === null &&
        existingProfile.profile.incorporation_location === null &&
        existingProfile.profile.fiscal_year_end === null &&
        existingProfile.profile.employee_count === null &&
        existingProfile.profile.shares_outstanding === null;

      // If profile record exists with all nulls, extraction likely already completed
      // Return empty profile without extracting flag to stop polling
      if (allNull) {
        return NextResponse.json({
          success: true,
          profile: existingProfile.profile,
          extracting: false, // Explicitly set to false to stop polling
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

    // Check if extraction is already in progress (by checking recent updates)
    // This is a simple check - if profile was updated in last 30 seconds, extraction might be running
    const { data: recentUpdate } = await supabase
      .from('companies')
      .select('updated_at')
      .eq('id', companyId)
      .single();

    const justUpdated = recentUpdate && typeof recentUpdate === 'object' && 'updated_at' in recentUpdate &&
      (Date.now() - new Date((recentUpdate as { updated_at: string }).updated_at).getTime()) < 30000; // Within 30 seconds

    // Trigger extraction in background (fire and forget) only if not recently updated
    if (!justUpdated) {
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
    }

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
      extracting: !justUpdated, // Only set extracting if we just started extraction
      startedAt: Date.now(), // Track when extraction started
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
