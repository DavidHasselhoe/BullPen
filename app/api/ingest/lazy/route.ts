import { NextRequest, NextResponse } from 'next/server';
import { lazyIngestCompany } from '@/lib/search/lazy-ingestion';
import { withRateLimit, addSecurityHeaders, validateTickerParam } from '@/lib/security/api-security';
import { logger } from '@/lib/utils/logger';

/**
 * POST /api/ingest/lazy
 *
 * Lazy ingestion endpoint - ingests company on-demand.
 * Rate limited to prevent abuse (10 requests per 5 minutes).
 *
 * Request body:
 * - ticker:        Company ticker (required, validated)
 * - forceRefresh:  boolean (optional) — bypasses staleness/count skip guard,
 *                  useful for a "Refresh data" button in the UI
 *
 * This endpoint runs the full XBRL-first pipeline:
 * 1. Fetches SEC Submissions → upserts all filings
 * 2. Extracts all metrics via XBRL Company Facts API (0 AI calls)
 * 3. Downloads narrative text for AI analysis
 * 4. Generates signals, composite scores, and trends
 * 5. Marks company_index.has_data = true
 */
async function handler(request: NextRequest) {
  try {
    // Limit request body size to prevent DoS
    const body = await request.json().catch(() => null);
    
    if (!body || typeof body !== 'object') {
      return addSecurityHeaders(
        NextResponse.json(
          { success: false, error: 'Invalid request body' },
          { status: 400 }
        )
      );
    }

    const { ticker, forceRefresh } = body;

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

    // Track progress for logging (minimal in production)
    const progressSteps: Array<{ step: string; details?: any }> = [];
    const onProgress = (step: string, details?: any) => {
      progressSteps.push({ step, details });
      logger.debug(`Lazy Ingestion: ${step}`, details);
    };

    const result = await lazyIngestCompany(
      tickerValidation.normalized!,
      { forceRefresh: forceRefresh === true },
      onProgress,
    );

    if (!result.success) {
      logger.error('Lazy ingestion failed', undefined, { 
        ticker: tickerValidation.normalized,
        error: result.error 
      });
      
      return addSecurityHeaders(
        NextResponse.json(
          {
            success: false,
            error: 'Ingestion failed. Please try again later.',
          },
          { status: 500 }
        )
      );
    }

    return addSecurityHeaders(
      NextResponse.json({
        success: true,
        companyId: result.companyId,
        ticker: result.ticker,
        filingsIngested: result.filingsIngested,
      })
    );
  } catch (error) {
    logger.error('Lazy ingestion error', error);
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

// Apply rate limiting: 10 requests per 5 minutes (prevents abuse, allows reasonable testing)
// Note: Each ingestion can take 30-60 seconds, so this allows testing multiple companies
export const POST = withRateLimit(handler, { windowMs: 5 * 60 * 1000, maxRequests: 10 });
