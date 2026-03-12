import { NextRequest, NextResponse } from 'next/server';
import { getCompanyOverview } from '@/lib/company/company-overview';
import { logger } from '@/lib/utils/logger';

/**
 * GET /api/company/[companyId]/overview
 * 
 * Gets or generates a company overview summary
 * Returns cached overview if available, otherwise generates and caches it
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

    const result = await getCompanyOverview(companyId);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || 'Failed to get company overview' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      overview: result.overview,
    });
  } catch (error) {
    logger.error('Error getting company overview', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
