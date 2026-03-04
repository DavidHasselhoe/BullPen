import { NextRequest, NextResponse } from 'next/server';
import { ensureLogoForTicker } from '@/lib/logos/logos-orchestrator';

/**
 * GET /api/logo/[ticker]
 *
 * Ensures logo exists in Supabase storage for the ticker.
 * If missing: fetches from Logo.dev API, saves to storage, returns URL.
 * No company record or ingestion pipeline required.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ ticker: string }> }
) {
  try {
    const { ticker } = await context.params;
    if (!ticker) {
      return NextResponse.json(
        { success: false, error: 'Missing ticker' },
        { status: 400 }
      );
    }

    const result = await ensureLogoForTicker(ticker);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || 'Logo not found', logoUrl: null },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      logoUrl: result.logoUrl,
    });
  } catch (error) {
    console.error('[Logo API] Error ensuring logo:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
        logoUrl: null,
      },
      { status: 500 }
    );
  }
}
