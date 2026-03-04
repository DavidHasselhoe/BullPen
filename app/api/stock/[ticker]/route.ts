import { NextRequest, NextResponse } from 'next/server';
import { getCompanyByTicker } from '@/lib/ingestion/database';
import { getStorageLogoUrl } from '@/lib/logos/logos-storage';
import { withRateLimit, addSecurityHeaders, validateTickerParam } from '@/lib/security/api-security';
import { logger } from '@/lib/utils/logger';
import type { Company } from '@/lib/types/database';

async function handler(
  request: NextRequest,
  context: { params: Promise<{ ticker: string }> }
) {
  try {
    const params = await context.params;
    const ticker = params.ticker;

    // Validate ticker input
    const tickerValidation = validateTickerParam(ticker);
    if (!tickerValidation.valid) {
      return addSecurityHeaders(
        NextResponse.json(
          { success: false, error: tickerValidation.error || 'Invalid ticker' },
          { status: 400 }
        )
      );
    }

    const result = await getCompanyByTicker(tickerValidation.normalized!);

    if (!result.success || !result.data) {
      return addSecurityHeaders(
        NextResponse.json(
          { success: false, error: 'Company not found' },
          { status: 404 }
        )
      );
    }

    const company = result.data as Company;
    const enriched = {
      ...company,
      logo_url: company.logo_url || getStorageLogoUrl(company.ticker),
    };
    return addSecurityHeaders(
      NextResponse.json({
        success: true,
        company: enriched,
      })
    );
  } catch (error) {
    logger.error('Error fetching company', error);
    return addSecurityHeaders(
      NextResponse.json(
        { success: false, error: 'Internal server error' },
        { status: 500 }
      )
    );
  }
}

// Apply rate limiting: 120 requests per minute
export const GET = withRateLimit(handler, { windowMs: 60 * 1000, maxRequests: 120 });
