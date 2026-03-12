/**
 * GET /api/stock/[ticker]/earnings-dates
 *
 * Returns earnings announcement dates from SEC 8-K Item 2.02 filings.
 * The 8-K filing date = earnings announcement date (when company reported).
 * No external API required — uses our ingested filings.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/logger';

export interface ReportedEarningsDate {
  /** Date when earnings were announced (8-K filing date) */
  date: string;
  /** Period end date if known (e.g. quarter ended) */
  periodEndDate?: string;
  /** Source: always 'SEC' for 8-K Item 2.02 */
  source: 'SEC';
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ ticker: string }> }
) {
  try {
    const params = await context.params;
    const ticker = params.ticker?.toUpperCase();

    if (!ticker) {
      return NextResponse.json(
        { success: false, error: 'Ticker parameter required' },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    // Get company ID
    const { data: company, error: companyErr } = await supabase
      .from('companies')
      .select('id')
      .eq('ticker', ticker)
      .single();

    if (companyErr || !company) {
      return NextResponse.json({
        success: true,
        earnings: [],
        message: 'Company not found or no SEC data',
      });
    }

    // 8-K Item 2.02 = Results of Operations (earnings release). Filing date = earnings announcement date.
    const { data: filings, error: filingsErr } = await supabase
      .from('filings')
      .select('filing_date, period_end_date')
      .eq('company_id', company.id)
      .eq('filing_type', '8-K')
      .contains('items', ['2.02'])
      .order('filing_date', { ascending: false })
      .limit(12);

    if (filingsErr) {
      logger.error('[earnings-dates] Query error', filingsErr);
      return NextResponse.json({
        success: false,
        error: filingsErr.message,
        earnings: [],
      });
    }

    const earnings: ReportedEarningsDate[] = (filings || []).map((f) => ({
      date: f.filing_date,
      periodEndDate: f.period_end_date || undefined,
      source: 'SEC' as const,
    }));

    return NextResponse.json({
      success: true,
      earnings,
    });
  } catch (error) {
    logger.error('[earnings-dates] Error', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
        earnings: [],
      },
      { status: 500 }
    );
  }
}
