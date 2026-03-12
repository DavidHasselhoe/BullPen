// API Route: POST /api/ingest
// Triggers SEC filing ingestion for a company
// Secured: requires INGEST_SECRET or CRON_SECRET; rate limited.

import { NextRequest, NextResponse } from 'next/server';
import {
  ingestFiling,
  ingestLatestFiling,
  isValidCIK,
  isValidAccessionNumber,
} from '@/lib/ingestion/filing-ingestion';
import { withRateLimit, addSecurityHeaders } from '@/lib/security/api-security';
import { logger } from '@/lib/utils/logger';

/**
 * Request body schema
 */
interface IngestRequest {
  cik: string;
  accessionNumber?: string;
  filingType?: string;
}

/**
 * Verify ingest authorization. Requires Bearer token matching INGEST_SECRET or CRON_SECRET.
 */
function checkIngestAuth(request: NextRequest): boolean {
  const secret = process.env.INGEST_SECRET || process.env.CRON_SECRET;
  if (!secret) {
    return false;
  }
  const authHeader = request.headers.get('authorization');
  return authHeader === `Bearer ${secret}`;
}

/**
 * POST /api/ingest
 *
 * Ingests a SEC filing into the database. Requires Authorization: Bearer <INGEST_SECRET or CRON_SECRET>.
 * Set INGEST_SECRET or CRON_SECRET in environment variables.
 *
 * Request body:
 * - cik: Company CIK (required)
 * - accessionNumber: Specific filing to ingest (optional)
 * - filingType: Type of filing (default: 10-K, used if no accessionNumber)
 *
 * Examples:
 *
 * Ingest specific filing:
 * {
 *   "cik": "0000320193",
 *   "accessionNumber": "0000320193-23-000077"
 * }
 *
 * Ingest latest 10-K:
 * {
 *   "cik": "0000320193",
 *   "filingType": "10-K"
 * }
 */
async function handler(request: NextRequest) {
  if (!checkIngestAuth(request)) {
    return addSecurityHeaders(
      NextResponse.json(
        { error: 'Unauthorized. Set INGEST_SECRET or CRON_SECRET and pass Authorization: Bearer <secret>.' },
        { status: 401 }
      )
    );
  }

  try {
    const body = await request.json().catch(() => null) as IngestRequest | null;
    if (!body || typeof body !== 'object') {
      return addSecurityHeaders(
        NextResponse.json({ error: 'Invalid or missing JSON body' }, { status: 400 })
      );
    }

    // Validate required fields
    if (!body.cik) {
      return addSecurityHeaders(
        NextResponse.json({ error: 'Missing required field: cik' }, { status: 400 })
      ) as NextResponse;
    }

    // Validate CIK format
    if (!isValidCIK(body.cik)) {
      return addSecurityHeaders(
        NextResponse.json(
          { error: 'Invalid CIK format. Expected up to 10 digits.' },
          { status: 400 }
        )
      );
    }

    // Validate accession number if provided
    if (body.accessionNumber && !isValidAccessionNumber(body.accessionNumber)) {
      return addSecurityHeaders(
        NextResponse.json(
          {
            error:
              'Invalid accession number format. Expected: XXXXXXXXXX-YY-XXXXXX',
          },
          { status: 400 }
        )
      );
    }

    // Progress tracking
    const progressSteps: Array<{ step: string; details?: any }> = [];
    const onProgress = (step: string, details?: any) => {
      progressSteps.push({ step, details });
    };

    let result;

    // Ingest specific filing or latest filing
    if (body.accessionNumber) {
      result = await ingestFiling(body.cik, body.accessionNumber, onProgress);
    } else {
      const filingType = body.filingType || '10-K';
      result = await ingestLatestFiling(body.cik, filingType, onProgress);
    }

    if (!result.success) {
      return addSecurityHeaders(
        NextResponse.json(
          { error: result.error, progress: progressSteps },
          { status: 500 }
        )
      );
    }

    return addSecurityHeaders(NextResponse.json({
      success: true,
      message: 'Filing ingested successfully',
      data: {
        filingId: result.filingId,
        companyId: result.companyId,
        sectionsCreated: result.sectionsCreated,
        details: result.details,
      },
      progress: progressSteps,
    }));
  } catch (error) {
    logger.error('Ingestion API error', error);
    return addSecurityHeaders(
      NextResponse.json(
        {
          error: 'Internal server error',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        { status: 500 }
      )
    );
  }
}

// Rate limit: 5 requests per minute (ingestion is heavy)
export const POST = withRateLimit(handler, { windowMs: 60 * 1000, maxRequests: 5 });

/**
 * GET /api/ingest
 *
 * Returns API documentation
 */
export async function GET() {
  return NextResponse.json({
    endpoint: '/api/ingest',
    method: 'POST',
    description: 'Ingests SEC filings into the BullPen database. Requires Authorization: Bearer <INGEST_SECRET or CRON_SECRET>.',
    authRequired: true,
    requestBody: {
      cik: 'Company CIK (required)',
      accessionNumber: 'Specific filing accession number (optional)',
      filingType: 'Filing type (optional, default: 10-K)',
    },
    examples: [
      {
        description: 'Ingest specific filing',
        body: {
          cik: '0000320193',
          accessionNumber: '0000320193-23-000077',
        },
      },
      {
        description: 'Ingest latest 10-K',
        body: {
          cik: '0000320193',
          filingType: '10-K',
        },
      },
      {
        description: 'Ingest latest 10-Q',
        body: {
          cik: '0000320193',
          filingType: '10-Q',
        },
      },
      {
        description: 'Ingest latest 8-K (earnings releases, stock splits, material events)',
        body: {
          cik: '0000320193',
          filingType: '8-K',
        },
      },
    ],
  });
}
