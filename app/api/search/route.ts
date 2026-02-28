import { NextRequest, NextResponse } from 'next/server';
import { searchCompanies } from '@/lib/search/search-db';
import { withRateLimit, addSecurityHeaders, validateSearchQueryParam } from '@/lib/security/api-security';
import { validateLimit } from '@/lib/security/input-validation';
import { logger } from '@/lib/utils/logger';

async function handler(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const q = searchParams.get('q');
    const limitParam = searchParams.get('limit');
    
    // Validate and sanitize inputs
    const queryValidation = validateSearchQueryParam(q);
    if (!queryValidation.valid) {
      return NextResponse.json(
        { success: false, error: queryValidation.error || 'Invalid search query' },
        { status: 400 }
      );
    }

    const limit = validateLimit(limitParam, 100, 15); // Max 100, default 15

    if (!queryValidation.sanitized || queryValidation.sanitized.trim().length === 0) {
      return addSecurityHeaders(
        NextResponse.json({
          success: true,
          results: [],
        })
      );
    }

    const result = await searchCompanies(queryValidation.sanitized, limit);

    if (!result.success) {
      logger.error('Search error', undefined, { error: result.error });
      return addSecurityHeaders(
        NextResponse.json(
          { 
            success: false, 
            error: 'Search failed',
            hint: result.error?.includes('does not exist') 
              ? 'Please run: supabase db push && npm run bootstrap-company-index' 
              : undefined
          },
          { status: 500 }
        )
      );
    }

    return addSecurityHeaders(
      NextResponse.json({
        success: true,
        results: result.data || [],
      })
    );
  } catch (error) {
    logger.error('Error searching companies', error);
    return addSecurityHeaders(
      NextResponse.json(
        { 
          success: false, 
          error: 'Internal server error'
        },
        { status: 500 }
      )
    );
  }
}

// Apply rate limiting: 100 requests per minute
export const GET = withRateLimit(handler, { windowMs: 60 * 1000, maxRequests: 100 });
