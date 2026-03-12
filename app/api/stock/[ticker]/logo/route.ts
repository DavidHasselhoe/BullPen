import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import { ingestCompanyLogo } from '@/lib/logos/logos-orchestrator';
import { logger } from '@/lib/utils/logger';

/**
 * POST /api/stock/[ticker]/logo
 * 
 * Checks if company logo exists, and if not, fetches and stores it
 * Returns the logo URL or null
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ ticker: string }> }
) {
  try {
    const params = await context.params;
    const ticker = params.ticker?.toUpperCase();
    
    if (!ticker) {
      return NextResponse.json(
        { success: false, error: 'Missing ticker parameter' },
        { status: 400 }
      );
    }

    // Get company from database
    const supabase = createServerClient();
    const { data: companyData, error: companyError } = await supabase
      .from('companies')
      .select('id, ticker, name, logo_url')
      .eq('ticker', ticker)
      .single();

    if (companyError || !companyData) {
      return NextResponse.json(
        { success: false, error: 'Company not found' },
        { status: 404 }
      );
    }

    // Type assertion for company data
    const company = companyData as { id: string; ticker: string; name: string; logo_url: string | null };

    // If logo already exists, return it
    if (company.logo_url) {
      return NextResponse.json({
        success: true,
        logoUrl: company.logo_url,
        alreadyExists: true,
      });
    }

    // Logo doesn't exist, fetch it
    const result = await ingestCompanyLogo(
      company.ticker,
      company.name,
      company.id,
      () => {}
    );

    if (result.success && result.logoUrl) {
      return NextResponse.json({
        success: true,
        logoUrl: result.logoUrl,
        alreadyExists: false,
      });
    }

    return NextResponse.json({
      success: false,
      error: result.error || 'Failed to fetch logo',
      logoUrl: null,
    });
  } catch (error) {
    logger.error('Error checking/fetching logo', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
