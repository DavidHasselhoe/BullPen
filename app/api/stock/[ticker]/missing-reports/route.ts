import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import { checkCompanyReports, calculateExpectedReports } from '@/lib/ingestion/missing-reports';

/**
 * GET /api/stock/[ticker]/missing-reports
 * 
 * Checks if a company is missing expected SEC reports
 * Returns the count of missing 10-Ks and 10-Qs
 */
export async function GET(
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
    const { data: company, error: companyError } = await supabase
      .from('companies')
      .select('id, ticker, cik')
      .eq('ticker', ticker)
      .single();

    if (companyError || !company) {
      return NextResponse.json(
        { success: false, error: 'Company not found' },
        { status: 404 }
      );
    }

    // Type assertion for company data
    const companyData = company as { id: string; ticker: string; cik: string };

    // Check existing reports
    const reports = await checkCompanyReports(companyData.id, companyData.cik);

    if (!reports.success) {
      return NextResponse.json(
        { success: false, error: reports.error || 'Failed to check reports' },
        { status: 500 }
      );
    }

    // Calculate expected reports
    const { expected10KYears, expected10QPeriods, expected10K, expected10Q } = calculateExpectedReports();
    
    // Find missing years for 10-Ks
    const missing10KYears = new Set<number>();
    expected10KYears.forEach((year) => {
      if (!reports.existing10KYears.has(year)) {
        missing10KYears.add(year);
      }
    });
    
    // Find missing quarters for 10-Qs
    const missing10QPeriods = new Set<string>();
    expected10QPeriods.forEach((period) => {
      if (!reports.existing10QPeriods.has(period)) {
        missing10QPeriods.add(period);
      }
    });
    
    const missing10K = missing10KYears.size;
    const missing10Q = missing10QPeriods.size;

    return NextResponse.json({
      success: true,
      existing10K: reports.existing10K,
      existing10Q: reports.existing10Q,
      expected10K,
      expected10Q,
      missing10K,
      missing10Q,
      missing10KYears: Array.from(missing10KYears),
      missing10QPeriods: Array.from(missing10QPeriods),
      hasMissingReports: missing10K > 0 || missing10Q > 0,
    });
  } catch (error) {
    console.error('Error checking missing reports:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
