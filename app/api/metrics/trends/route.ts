import { NextRequest, NextResponse } from 'next/server';
import { getCompanyMetricTrends } from '@/lib/trends/trends-db';
import { logger } from '@/lib/utils/logger';
import { logger } from '@/lib/utils/logger';
import type { MetricType, PeriodType } from '@/lib/types/database';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const companyId = searchParams.get('companyId');
  const metricType = searchParams.get('metricType') as MetricType;
  const periodType = searchParams.get('periodType') as PeriodType;

  if (!companyId || !metricType || !periodType) {
    return NextResponse.json(
      { success: false, error: 'Missing required parameters' },
      { status: 400 }
    );
  }

  try {
    const result = await getCompanyMetricTrends(companyId, metricType);

    if (!result.success || !result.data) {
      return NextResponse.json(
        { success: false, error: result.error || 'No trends found' },
        { status: 404 }
      );
    }

    // Filter trends by period type and select the strongest one
    const filteredTrends = result.data.filter((trend) => trend.period_type === periodType);
    
    if (filteredTrends.length === 0) {
      return NextResponse.json({
        success: true,
        trend: null,
      });
    }

    // Select the strongest trend (highest strength score)
    const strongestTrend = filteredTrends.reduce((prev, current) =>
      current.strength > prev.strength ? current : prev
    );

    return NextResponse.json({
      success: true,
      trend: strongestTrend,
    });
  } catch (error) {
    logger.error('Error fetching trends', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
