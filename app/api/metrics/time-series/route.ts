import { NextRequest, NextResponse } from 'next/server';
import { getMetricsTimeSeries } from '@/lib/metrics/metrics-ui';
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
    const timeSeries = await getMetricsTimeSeries(companyId, metricType, periodType);

    // Return 200 with empty data instead of 404 - frontend can show "no data" state
    if (!timeSeries || !timeSeries.data || timeSeries.data.length === 0) {
      return NextResponse.json({
        success: true,
        timeSeries: {
          metricType,
          periodType,
          unit: metricType === 'eps_diluted' || metricType === 'eps_basic' ? 'USD/shares' : 'USD',
          data: [],
        },
      });
    }

    return NextResponse.json({
      success: true,
      timeSeries,
    });
  } catch (error) {
    console.error('Error fetching time series:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
