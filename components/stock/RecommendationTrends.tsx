'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useQuery } from '@tanstack/react-query';
import { BarChart3 } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { RecommendationTrend } from '@/lib/finnhub/finnhub-client';

interface RecommendationTrendsProps {
  ticker: string;
}

interface RecommendationTrendsResponse {
  success: boolean;
  trends?: RecommendationTrend[];
  error?: string;
}

function getPeriodLabel(period: string): string {
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

export function RecommendationTrends({ ticker }: RecommendationTrendsProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  
  const { data, isLoading, error } = useQuery({
    queryKey: ['recommendation-trends', ticker],
    queryFn: async (): Promise<RecommendationTrend[]> => {
      try {
        const response = await fetch(`/api/stock/${ticker}/recommendations`);
        
        if (!response.ok) {
          console.error(`[RecommendationTrends] API error (${response.status}) for ${ticker}`);
          return [];
        }
        
        const result: RecommendationTrendsResponse = await response.json();

        if (result.success && result.trends) {
          return result.trends;
        }

        if (result.error) {
          console.error(`[RecommendationTrends] API returned error for ${ticker}:`, result.error);
        }

        return [];
      } catch (err) {
        console.error(`[RecommendationTrends] Error fetching recommendations for ${ticker}:`, err);
        return [];
      }
    },
    enabled: !!ticker,
    staleTime: 1000 * 60 * 60 * 24, // 24 hours - recommendations don't change often
  });

  if (error) {
    return null;
  }

  if (isLoading) {
    return (
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Analyst Recommendations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-full" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Analyst Recommendations</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No recommendation data available</p>
        </CardContent>
      </Card>
    );
  }

  const currentTrend = data[currentIndex];
  const trendTotal = currentTrend.strongBuy + currentTrend.buy + currentTrend.hold + currentTrend.sell + currentTrend.strongSell;
  const buyPercent = trendTotal > 0 ? ((currentTrend.strongBuy + currentTrend.buy) / trendTotal) * 100 : 0;
  const sellPercent = trendTotal > 0 ? ((currentTrend.strongSell + currentTrend.sell) / trendTotal) * 100 : 0;

  return (
    <Card className="mb-8">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          Analyst Recommendations
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="p-4 rounded-lg border border-border/50 bg-accent/30">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              {data.length > 1 ? (
                <Select value={currentIndex.toString()} onValueChange={(value) => setCurrentIndex(parseInt(value))}>
                  <SelectTrigger className="w-[140px] h-8 text-sm">
                    <SelectValue>
                      {getPeriodLabel(currentTrend.period)}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {data.map((trend, index) => {
                      const periodLabel = getPeriodLabel(trend.period);
                      return (
                        <SelectItem key={`${trend.period}-${index}`} value={index.toString()}>
                          {periodLabel}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              ) : (
                <span className="text-sm font-semibold text-foreground">
                  {getPeriodLabel(currentTrend.period)}
                </span>
              )}
              <span className="text-xs text-muted-foreground">{trendTotal} analysts</span>
            </div>

            {/* Recommendation Breakdown */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-green-600 dark:text-green-400 font-medium">
                  Strong Buy
                </span>
                <span className="text-foreground">{currentTrend.strongBuy}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-green-700 dark:text-green-500">Buy</span>
                <span className="text-foreground">{currentTrend.buy}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Hold</span>
                <span className="text-foreground">{currentTrend.hold}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-red-700 dark:text-red-500">Sell</span>
                <span className="text-foreground">{currentTrend.sell}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-red-600 dark:text-red-400 font-medium">
                  Strong Sell
                </span>
                <span className="text-foreground">{currentTrend.strongSell}</span>
              </div>
            </div>

            {/* Visual Bar */}
            <div className="pt-2 border-t border-border/50">
              <div className="relative h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="absolute left-0 h-full bg-green-600 dark:bg-green-500 transition-all"
                  style={{ width: `${buyPercent}%` }}
                />
                <div
                  className="absolute right-0 h-full bg-red-600 dark:bg-red-500 transition-all"
                  style={{ width: `${sellPercent}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
