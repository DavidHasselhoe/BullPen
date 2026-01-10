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
  let companyId: string | undefined;
  
  try {
    const params = await context.params;
    companyId = params.companyId;

    if (!companyId) {
      return NextResponse.json(
        { success: false, error: 'Company ID is required' },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

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

      // Profile exists but has no data - might need to extract
      // Check if we've already tried extraction (by checking if all fields are explicitly null)
      const allNull = 
        existingProfile.profile.sic_code === null &&
        existingProfile.profile.sector === null &&
        existingProfile.profile.incorporation_location === null &&
        existingProfile.profile.fiscal_year_end === null &&
        existingProfile.profile.employee_count === null &&
        existingProfile.profile.shares_outstanding === null;

      // If all fields are null, try extracting again (could be from before migration)
      // Only skip if we recently updated (within last 2 minutes)
      const { data: recentUpdateCheckForNull } = await supabase
        .from('companies')
        .select('updated_at')
        .eq('id', companyId)
        .single();

      const recentlyUpdated = recentUpdateCheckForNull && typeof recentUpdateCheckForNull === 'object' && 'updated_at' in recentUpdateCheckForNull &&
        (Date.now() - new Date((recentUpdateCheckForNull as { updated_at: string }).updated_at).getTime()) < 120000; // Within 2 minutes

      // If all null but not recently updated, extract again
      if (allNull && !recentlyUpdated) {
        console.log(`[Profile API] Profile exists but all fields are null for ${companyId}, triggering extraction`);
        // Continue to extraction logic below
      } else if (allNull && recentlyUpdated) {
        // Extraction just ran but found no data - return empty profile
        console.log(`[Profile API] Profile recently updated but still empty for ${companyId}`);
        return NextResponse.json({
          success: true,
          profile: existingProfile.profile,
          extracting: false, // Explicitly set to false to stop polling
        });
      }
    }

    // Profile doesn't exist or is incomplete - extract it in background
    // Return immediately with empty profile, extraction happens async
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
    if (!justUpdated && companyId) {
      const typedCompany = company as { id: string; cik: string };
      const currentCompanyId = companyId; // Capture in closure
      console.log(`[Profile API] Starting extraction for company ${currentCompanyId} (CIK: ${typedCompany.cik})`);
      
      extractCompanyProfile(typedCompany.cik, currentCompanyId)
        .then((profileData) => {
          console.log(`[Profile API] Extraction completed for ${currentCompanyId}:`, {
            hasSic: !!profileData.sic_code,
            hasSector: !!profileData.sector,
            hasIndustry: !!profileData.industry,
            hasLocation: !!profileData.incorporation_location,
            hasFye: !!profileData.fiscal_year_end,
            hasEmployees: !!profileData.employee_count,
            hasShares: !!profileData.shares_outstanding,
          });
          
          return updateCompanyProfile(currentCompanyId, profileData);
        })
        .then((updateResult) => {
          if (updateResult.success) {
            console.log(`[Profile API] Profile updated successfully for ${currentCompanyId}`);
          } else {
            console.error(`[Profile API] Failed to update profile for ${currentCompanyId}:`, updateResult.error);
          }
        })
        .catch((err) => {
          console.error(`[Profile API] Error extracting company profile for ${currentCompanyId}:`, err);
          console.error(`[Profile API] Error stack:`, err instanceof Error ? err.stack : 'No stack trace');
        });
    } else if (companyId) {
      console.log(`[Profile API] Skipping extraction for ${companyId} - recently updated`);
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
    console.error('[Profile API] Error in GET handler:', error);
    console.error('[Profile API] Error details:', {
      companyId: companyId ?? 'unknown',
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      errorStack: error instanceof Error ? error.stack : 'No stack trace',
    });
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
