'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import type { HoldingWithPrice } from './types';

interface HoldingsPieChartProps {
  holdings: HoldingWithPrice[];
}

const COLORS = [
  '#3b82f6', // blue
  '#10b981', // green
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#84cc16', // lime
  '#f97316', // orange
  '#6366f1', // indigo
];

interface ChartData {
  name: string;
  value: number;
  allocation: number;
}

export function HoldingsPieChart({ holdings }: HoldingsPieChartProps) {
  const chartData = useMemo((): ChartData[] => {
    // Calculate total market value
    const totalMarketValue = holdings.reduce((sum, holding) => {
      return sum + (holding.marketValue || 0);
    }, 0);

    // If no market values, fall back to count-based allocation
    if (totalMarketValue === 0) {
      const countPerStock: Record<string, number> = {};
      holdings.forEach((holding) => {
        countPerStock[holding.symbol] = (countPerStock[holding.symbol] || 0) + 1;
      });

      const totalCount = holdings.length;
      return Object.entries(countPerStock).map(([symbol, count]) => ({
        name: symbol,
        value: count,
        allocation: (count / totalCount) * 100,
      }));
    }

    // Use market value for allocation
    return holdings
      .filter((holding) => holding.marketValue && holding.marketValue > 0)
      .map((holding) => ({
        name: holding.symbol,
        value: holding.marketValue!,
        allocation: (holding.marketValue! / totalMarketValue) * 100,
      }))
      .sort((a, b) => b.value - a.value); // Sort by value descending
  }, [holdings]);

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length > 0) {
      const data = payload[0].payload as ChartData;
      return (
        <div className="rounded-lg border bg-card p-3 shadow-lg">
          <p className="font-medium text-foreground">{data.name}</p>
          <p className="text-sm text-muted-foreground">
            Allocation: {data.allocation.toFixed(1)}%
          </p>
          <p className="text-sm font-semibold text-foreground">
            Value: {new Intl.NumberFormat('en-US', {
              style: 'currency',
              currency: 'USD',
              minimumFractionDigits: 0,
              maximumFractionDigits: 0,
            }).format(data.value)}
          </p>
        </div>
      );
    }
    return null;
  };

  if (chartData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Portfolio Allocation</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
            No data available for chart
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="select-none" onPointerDown={(e) => e.preventDefault()} onMouseDown={(e) => e.preventDefault()}>
      <CardHeader>
        <CardTitle>Portfolio Allocation</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={350}>
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={({ name, allocation }) => `${name} (${allocation.toFixed(1)}%)`}
              outerRadius={100}
              fill="#8884d8"
              dataKey="value"
              animationBegin={0}
              animationDuration={400}
              activeIndex={null}
              onClick={() => {}}
            >
              {chartData.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={COLORS[index % COLORS.length]}
                />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
            <Legend
              formatter={(value) => {
                const data = chartData.find((d) => d.name === value);
                return data ? `${value} (${data.allocation.toFixed(1)}%)` : value;
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
