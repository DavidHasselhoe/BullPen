'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface CompositeScoreCardProps {
  companyId: string;
}

interface CompositeScore {
  score: number;
  direction: 'bullish' | 'neutral' | 'bearish';
  explanation: string;
}

interface CompositeScoreResponse {
  success: boolean;
  score?: CompositeScore;
  error?: string;
}

export function CompositeScoreCard({ companyId }: CompositeScoreCardProps) {
  const { data: score, isLoading } = useQuery<CompositeScore | null>({
    queryKey: ['composite-score', companyId],
    queryFn: async (): Promise<CompositeScore | null> => {
      const response = await fetch(`/api/metrics/composite-score?companyId=${companyId}`);
      const data: CompositeScoreResponse = await response.json();

      if (data.success && data.score) {
        return data.score;
      }
      return null;
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Composite Score</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!score) {
    return null;
  }

  const getDirectionConfig = (direction: string) => {
    switch (direction) {
      case 'bullish':
        return {
          icon: TrendingUp,
          color: 'text-green-600 dark:text-green-400',
          bgColor: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800',
        };
      case 'bearish':
        return {
          icon: TrendingDown,
          color: 'text-red-600 dark:text-red-400',
          bgColor: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
        };
      default:
        return {
          icon: Minus,
          color: 'text-muted-foreground',
          bgColor: 'bg-muted/50 border-border',
        };
    }
  };

  const config = getDirectionConfig(score.direction);
  const Icon = config.icon;

  return (
    <Card className={config.bgColor}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Composite Score
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-4">
          <div className={`text-3xl font-bold flex items-center gap-2 ${config.color}`}>
            <Icon className="h-6 w-6" />
            {score.score.toFixed(2)}
          </div>
          <div className="flex-1">
            <div className={`font-medium capitalize ${config.color}`}>
              {score.direction}
            </div>
            <div className="mt-1 text-sm text-muted-foreground">
              {score.explanation}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
