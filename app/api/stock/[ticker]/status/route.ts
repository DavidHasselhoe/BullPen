import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ ticker: string }> }
) {
  const params = await context.params;
  const ticker = params.ticker?.toUpperCase();

  if (!ticker) {
    return NextResponse.json(
      { success: false, error: 'Ticker parameter required' },
      { status: 400 }
    );
  }

  try {
    const supabase = createServerClient();

    // Get company
    const { data: company, error: companyError } = await supabase
      .from('companies')
      .select('id, name, ticker')
      .eq('ticker', ticker)
      .single();

    if (companyError || !company) {
      return NextResponse.json({
        success: true,
        status: {
          companyExists: false,
          filingsCount: 0,
          metricsCount: 0,
          trendsCount: 0,
          hasAnyData: false,
        },
      });
    }

    // Count filings
    const { count: filingsCount } = await supabase
      .from('filings')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', company.id)
      .eq('processing_status', 'completed');

    // Count metrics
    const { count: metricsCount } = await supabase
      .from('financial_metrics')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', company.id);

    // Count trends
    const { count: trendsCount } = await supabase
      .from('trends')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', company.id);

    const hasAnyData = (filingsCount || 0) > 0;

    return NextResponse.json({
      success: true,
      status: {
        companyExists: true,
        filingsCount: filingsCount || 0,
        metricsCount: metricsCount || 0,
        trendsCount: trendsCount || 0,
        hasAnyData,
      },
    });
  } catch (error) {
    console.error('Error checking stock status:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
