import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import type { Company } from '@/lib/types/database';
import { logger } from '@/lib/utils/logger';

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

    const companyData = company as Company;

    // Run all three count queries in parallel — they are independent
    const [filingsRes, metricsRes, trendsRes] = await Promise.all([
      supabase
        .from('filings')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', companyData.id)
        .eq('processing_status', 'completed'),
      supabase
        .from('financial_metrics')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', companyData.id),
      supabase
        .from('trends')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', companyData.id),
    ]);

    const filingsCount = filingsRes.count;
    const metricsCount = metricsRes.count;
    const trendsCount = trendsRes.count;

    // hasAnyData = we have financial metrics to display (not just filings)
    // A company can have filings but 0 metrics if ingestion failed or didn't complete
    const hasAnyData = (metricsCount || 0) > 0;

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
    logger.error('Error checking stock status', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
