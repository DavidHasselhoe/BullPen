// API Route: Get Sankey diagram for a company
// Returns cached or generates new Sankey diagram

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import { getOrCreateCompanySankey } from '@/lib/sankey/sankey-generator';
import { withRateLimit, addSecurityHeaders, validateTickerParam } from '@/lib/security/api-security';
import { logger } from '@/lib/utils/logger';

async function handler(
  request: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  try {
    const { ticker } = await params;

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

    const supabase = createServerClient();

    // Get company ID (parameterized query - safe from SQL injection)
    const { data: company, error: companyError } = await supabase
      .from('companies')
      .select('id')
      .eq('ticker', tickerValidation.normalized!)
      .maybeSingle();

    if (companyError || !company) {
      logger.warn('Company not found for Sankey', { ticker: tickerValidation.normalized, error: companyError?.message });
      return addSecurityHeaders(
        NextResponse.json(
          { success: false, error: 'Company not found' },
          { status: 404 }
        )
      );
    }

    // Get or create Sankey diagram
    const result = await getOrCreateCompanySankey(tickerValidation.normalized!, company.id);

    if (!result.success) {
      logger.error('Failed to get or create Sankey', undefined, { 
        ticker: tickerValidation.normalized,
        error: result.error 
      });
      
      return addSecurityHeaders(
        NextResponse.json(
          { success: false, error: 'Failed to generate diagram' },
          { status: 400 }
        )
      );
    }

    return addSecurityHeaders(
      NextResponse.json({
        success: true,
        data: result.data,
        confidence: result.confidence,
        source: result.source,
      })
    );
  } catch (error) {
    logger.error('Sankey API error', error);
    return addSecurityHeaders(
      NextResponse.json(
        {
          success: false,
          error: 'Internal server error',
        },
        { status: 500 }
      )
    );
  }
}

// Apply rate limiting: 60 requests per minute
export const GET = withRateLimit(handler, { windowMs: 60 * 1000, maxRequests: 60 });
