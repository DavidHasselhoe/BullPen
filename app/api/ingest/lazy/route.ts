import { NextRequest, NextResponse } from 'next/server';
import { lazyIngestCompany } from '@/lib/search/lazy-ingestion';

/**
 * POST /api/ingest/lazy
 * 
 * Lazy ingestion endpoint - ingests company on-demand
 * 
 * Request body:
 * - ticker: Company ticker (required)
 * 
 * This endpoint:
 * 1. Ingests latest 10-K
 * 2. Ingests last 4 10-Qs
 * 3. Runs full pipeline: metrics, AI, signals, trends, composite score
 * 4. Marks company_index.has_data = true
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { ticker } = body;

    if (!ticker || typeof ticker !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Missing or invalid ticker parameter' },
        { status: 400 }
      );
    }

    // Track progress for logging
    const progressSteps: Array<{ step: string; details?: any }> = [];
    const onProgress = (step: string, details?: any) => {
      progressSteps.push({ step, details });
      console.log(`[Lazy Ingestion] ${step}`, details || '');
    };

    const result = await lazyIngestCompany(ticker.toUpperCase(), onProgress);

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: result.error || 'Lazy ingestion failed',
          details: result.details,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      companyId: result.companyId,
      ticker: result.ticker,
      filingsIngested: result.filingsIngested,
      details: result.details,
    });
  } catch (error) {
    console.error('Lazy ingestion error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
