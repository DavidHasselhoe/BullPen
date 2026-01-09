'use client';

import { useEffect, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
  ReferenceLine,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { MetricTimeSeries } from '@/lib/metrics/metrics-ui';
import {
  formatMetricValue,
  formatChartDate,
  formatPeriodLabel,
  getMetricLabel,
} from '@/lib/metrics/metrics-formatting';

interface MetricsChartProps {
  timeSeries: MetricTimeSeries;
}

interface ChartDataPoint {
  date: string;
  value: number;
  fullDate: string;
  periodLabel: string;
  unit: string;
}

// Custom tooltip component for better formatting
function CustomTooltip(props: any) {
  const { active, payload } = props;
  if (active && payload && payload.length > 0) {
    const data = payload[0].payload as ChartDataPoint;
    const value = payload[0].value as number;
    return (
      <div className="rounded-lg border bg-card p-3 shadow-lg">
        <p className="text-sm font-medium text-foreground">{data.periodLabel}</p>
        <p className="text-base font-semibold text-foreground">
          {formatMetricValue(value, data.unit || 'USD')}
        </p>
      </div>
    );
  }
  return null;
}

export function MetricsChart({ timeSeries }: MetricsChartProps) {
  // Use a theme-aware stroke color that's visible in both light and dark modes
  // Default to light color for dark mode (which is the default theme)
  const [strokeColor, setStrokeColor] = useState('#fafafa');

  useEffect(() => {
    // Detect theme and set appropriate color
    if (typeof window !== 'undefined') {
      const root = document.documentElement;
      const isDark = root.classList.contains('dark') || window.matchMedia('(prefers-color-scheme: dark)').matches;
      setStrokeColor(isDark ? '#fafafa' : '#18181b'); // Light in dark mode, dark in light mode
    }
  }, []);

  // Format data for Recharts - ensure ascending order by date and valid numeric values
  const chartData: ChartDataPoint[] = [...timeSeries.data]
    .filter((point) => {
      // Filter out invalid data points
      const value = Number(point.value);
      return !isNaN(value) && isFinite(value) && value !== null && value !== undefined;
    })
    .sort((a, b) => new Date(a.periodEndDate).getTime() - new Date(b.periodEndDate).getTime())
    .map((point) => {
      const value = Number(point.value);
      
      // Type assertion for periodType (we only use annual/quarterly in metrics UI)
      const periodType = (timeSeries.periodType === 'annual' || timeSeries.periodType === 'quarterly')
        ? timeSeries.periodType
        : 'annual';
      
      return {
        date: formatChartDate(point.periodEndDate, periodType),
        value,
        fullDate: point.periodEndDate,
        periodLabel: formatPeriodLabel(point.periodEndDate, periodType),
        unit: point.unit || timeSeries.unit,
      };
    });

  // Format Y-axis labels
  const formatYAxis = (value: number) => {
    return formatMetricValue(value, timeSeries.unit);
  };

  const periodLabel = timeSeries.periodType === 'annual' ? 'Annual' : 'Quarterly';
  const metricLabel = getMetricLabel(timeSeries.metricType);

  if (chartData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{metricLabel} ({periodLabel})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
            No data available
          </div>
        </CardContent>
      </Card>
    );
  }

  // Determine if we have enough points for a line (need at least 2)
  const hasMultiplePoints = chartData.length >= 2;

  // Calculate trend direction (positive or negative overall)
  // Compare first and last values to determine overall trend
  let trendDirection: 'positive' | 'negative' | 'neutral' = 'neutral';
  let gradientStart = 0;
  let gradientEnd = 0;

  if (chartData.length >= 2) {
    const firstValue = chartData[0].value;
    const lastValue = chartData[chartData.length - 1].value;
    const diff = lastValue - firstValue;
    
    if (diff > 0) {
      trendDirection = 'positive';
    } else if (diff < 0) {
      trendDirection = 'negative';
    }

    // Find min and max values for gradient positioning
    const values = chartData.map(d => d.value);
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    
    // Set gradient based on whether values are above or below zero (if applicable)
    // For most metrics, we want to fill to zero or minimum
    if (minValue >= 0) {
      // All positive values - fill to bottom (zero line)
      gradientStart = 0;
      gradientEnd = 0;
    } else if (maxValue <= 0) {
      // All negative values - fill to top (zero line)
      gradientStart = 0;
      gradientEnd = 0;
    } else {
      // Mixed positive and negative - use zero as reference
      gradientStart = 0;
      gradientEnd = 0;
    }
  }

  // Define gradient colors based on trend
  const gradientId = `gradient-${trendDirection}`;
  const areaColor = trendDirection === 'positive' 
    ? 'hsl(142, 76%, 36%)' // Green
    : trendDirection === 'negative'
    ? 'hsl(0, 84%, 60%)' // Red
    : 'hsl(var(--muted))'; // Neutral/muted

  const lineColor = trendDirection === 'positive'
    ? 'hsl(142, 76%, 46%)' // Brighter green
    : trendDirection === 'negative'
    ? 'hsl(0, 84%, 70%)' // Brighter red
    : strokeColor; // Use theme-aware color for neutral

  // Find the baseline (zero or minimum positive value) for area fill
  const baseline = chartData.length > 0 
    ? Math.min(0, Math.min(...chartData.map(d => d.value)) * 0.95)
    : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{metricLabel} ({periodLabel})</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={400}>
          <AreaChart
            data={chartData}
            margin={{ top: 5, right: 20, left: 10, bottom: 40 }}
          >
            <defs>
              {/* Green gradient for positive trend */}
              <linearGradient id="gradient-positive" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(142, 76%, 36%)" stopOpacity={0.3} />
                <stop offset="100%" stopColor="hsl(142, 76%, 36%)" stopOpacity={0.05} />
              </linearGradient>
              {/* Red gradient for negative trend */}
              <linearGradient id="gradient-negative" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(0, 84%, 60%)" stopOpacity={0.3} />
                <stop offset="100%" stopColor="hsl(0, 84%, 60%)" stopOpacity={0.05} />
              </linearGradient>
              {/* Neutral gradient */}
              <linearGradient id="gradient-neutral" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--muted))" stopOpacity={0.2} />
                <stop offset="100%" stopColor="hsl(var(--muted))" stopOpacity={0.02} />
              </linearGradient>
              <style>{`
                .recharts-cartesian-grid-horizontal line,
                .recharts-cartesian-grid-vertical line {
                  stroke: hsl(var(--border));
                  opacity: 0.4;
                  stroke-width: 1px;
                }
                .recharts-xAxis .recharts-cartesian-axis-tick text,
                .recharts-yAxis .recharts-cartesian-axis-tick text {
                  fill: hsl(var(--muted-foreground));
                  font-size: 12px;
                }
                .recharts-line path {
                  stroke-width: 3px !important;
                  opacity: 1 !important;
                }
                .recharts-line-curve {
                  stroke-width: 3px !important;
                  opacity: 1 !important;
                }
              `}</style>
            </defs>
            <CartesianGrid strokeDasharray="3 3" opacity={0.4} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11 }}
              angle={-45}
              textAnchor="end"
              height={60}
              interval="preserveStartEnd"
            />
            <YAxis
              tickFormatter={formatYAxis}
              tick={{ fontSize: 11 }}
              width={80}
            />
            <Tooltip content={<CustomTooltip />} />
            {/* Area fill beneath the line */}
            <Area
              type="monotone"
              dataKey="value"
              stroke="none"
              fill={`url(#gradient-${trendDirection})`}
              fillOpacity={1}
              connectNulls={false}
              animationDuration={300}
              isAnimationActive={true}
              baseLine={baseline}
            />
            {/* Line on top of the area */}
            <Line
              type="monotone"
              dataKey="value"
              stroke={lineColor}
              strokeWidth={3}
              dot={{
                fill: lineColor,
                r: 5,
                strokeWidth: 2,
                stroke: 'hsl(var(--card))',
              }}
              activeDot={{
                r: 8,
                stroke: lineColor,
                strokeWidth: 3,
                fill: 'hsl(var(--card))',
              }}
              connectNulls={false}
              animationDuration={300}
              isAnimationActive={true}
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
