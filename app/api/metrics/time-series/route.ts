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

    if (!timeSeries) {
      return NextResponse.json(
        { success: false, error: 'No metrics found for the selected filters' },
        { status: 404 }
      );
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
