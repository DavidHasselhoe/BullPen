import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import { calculateFilingCompositeScore } from '@/lib/scores/scores-orchestrator';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const companyId = searchParams.get('companyId');

  if (!companyId) {
    return NextResponse.json(
      { success: false, error: 'companyId parameter required' },
      { status: 400 }
    );
  }

  try {
    const supabase = createServerClient();

    // Get latest filing for company
    const { data: filings, error: filingError } = await supabase
      .from('filings')
      .select('id')
      .eq('company_id', companyId)
      .eq('processing_status', 'completed')
      .order('filing_date', { ascending: false })
      .limit(1);

    if (filingError || !filings || filings.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No completed filings found' },
        { status: 404 }
      );
    }

    const filingId = (filings[0] as { id: string }).id;

    // Calculate composite score
    const result = await calculateFilingCompositeScore(filingId);

    if (!result.success || !result.score) {
      return NextResponse.json(
        { success: false, error: 'Could not calculate composite score' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      score: {
        score: result.score.composite_score,
        direction: result.score.direction,
        explanation: result.score.explanation,
      },
    });
  } catch (error) {
    console.error('Error fetching composite score:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
