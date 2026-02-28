'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useQuery } from '@tanstack/react-query';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { CompanyEarnings } from '@/lib/finnhub/finnhub-client';

interface EPSEstimatesChartProps {
  ticker: string;
}

interface CompanyEarningsResponse {
  success: boolean;
  earnings?: CompanyEarnings[];
  error?: string;
}

interface ChartDataPoint {
  period: string;
  actual: number | null;
  estimate: number | null;
}

function formatPeriod(period: string): string {
  // Convert "2024-01-01" to "Q1 2024" or similar
  try {
    const date = new Date(period);
    const month = date.getMonth() + 1;
    const quarter = Math.ceil(month / 3);
    const year = date.getFullYear();
    return `Q${quarter} ${year}`;
  } catch {
    return period;
  }
}

function formatEPS(value: number | null): string {
  if (value === null) return 'N/A';
  return value.toFixed(2);
}

function CustomTooltip(props: any) {
  const { active, payload } = props;
  if (active && payload && payload.length > 0) {
    const data = payload[0].payload as ChartDataPoint;
    return (
      <div className="rounded-lg border bg-card p-3 shadow-lg">
        <p className="text-sm font-medium text-foreground mb-2">{data.period}</p>
        {data.estimate !== null && (
          <p className="text-sm text-muted-foreground">
            Estimate: <span className="font-semibold text-foreground">${formatEPS(data.estimate)}</span>
          </p>
        )}
        {data.actual !== null && (
          <p className="text-sm text-muted-foreground">
            Actual: <span className="font-semibold text-foreground">${formatEPS(data.actual)}</span>
          </p>
        )}
      </div>
    );
  }
  return null;
}

export function EPSEstimatesChart({ ticker }: EPSEstimatesChartProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['eps-estimates', ticker],
    queryFn: async (): Promise<CompanyEarnings[]> => {
      try {
        const response = await fetch(`/api/stock/${ticker}/earnings`);
        
        if (!response.ok) {
          console.error(`[EPSEstimatesChart] API error (${response.status}) for ${ticker}`);
          return [];
        }
        
        const result: CompanyEarningsResponse = await response.json();

        if (result.success && result.earnings) {
          return result.earnings;
        }

        if (result.error) {
          console.error(`[EPSEstimatesChart] API returned error for ${ticker}:`, result.error);
        }

        return [];
      } catch (err) {
        console.error(`[EPSEstimatesChart] Error fetching earnings for ${ticker}:`, err);
        return [];
      }
    },
    enabled: !!ticker,
    staleTime: 1000 * 60 * 60 * 24, // 24 hours - earnings don't change often
  });

  if (error) {
    return null;
  }

  if (isLoading) {
    return (
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>EPS Actual vs Estimate</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>EPS Actual vs Estimate</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No EPS estimate data available</p>
        </CardContent>
      </Card>
    );
  }

  // Format data for chart - reverse to show most recent last
  const chartData: ChartDataPoint[] = [...data]
    .reverse()
    .map((earning) => ({
      period: formatPeriod(earning.period),
      actual: earning.actual,
      estimate: earning.estimate,
    }));

  return (
    <Card className="mb-8">
      <CardHeader>
        <CardTitle>EPS Actual vs Estimate</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart
            data={chartData}
            margin={{ top: 5, right: 20, left: 10, bottom: 40 }}
          >
            <CartesianGrid strokeDasharray="3 3" opacity={0.4} />
            <XAxis
              dataKey="period"
              tick={{ fontSize: 11 }}
              angle={-45}
              textAnchor="end"
              height={60}
            />
            <YAxis
              tick={{ fontSize: 11 }}
              tickFormatter={(value) => `$${value.toFixed(2)}`}
            />
            <Tooltip content={<CustomTooltip />} />
            <Line
              type="monotone"
              dataKey="estimate"
              stroke="#888888"
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={{ r: 4 }}
              name="Estimate"
            />
            <Line
              type="monotone"
              dataKey="actual"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={{ r: 4 }}
              name="Actual"
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
