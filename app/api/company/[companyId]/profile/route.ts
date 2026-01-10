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
      // Check if profile is complete (has at least some data)
      const hasAnyData = 
        existingProfile.profile.sic_code ||
        existingProfile.profile.sector ||
        existingProfile.profile.incorporation_location ||
        existingProfile.profile.fiscal_year_end;

      if (hasAnyData) {
        // Return cached profile
        return NextResponse.json({
          success: true,
          profile: existingProfile.profile,
        });
      }
    }

    // Profile doesn't exist or is incomplete - extract it
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

    // Extract profile data
    const typedCompany = company as { id: string; cik: string };
    const profileData = await extractCompanyProfile(typedCompany.cik, companyId);

    // Update database with profile data
    const updateResult = await updateCompanyProfile(companyId, profileData);

    if (!updateResult.success) {
      return NextResponse.json(
        { success: false, error: updateResult.error || 'Failed to update profile' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      profile: profileData,
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
