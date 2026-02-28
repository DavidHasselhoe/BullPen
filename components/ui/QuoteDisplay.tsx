'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Quote } from 'lucide-react';

interface QuoteResponse {
  success: boolean;
  quote?: {
    quote_text: string;
    author: string;
  };
  error?: string;
}

async function fetchRandomQuote(): Promise<QuoteResponse['quote'] | null> {
  try {
    const response = await fetch('/api/quotes/random');
    const data: QuoteResponse = await response.json();
    if (data.success && data.quote) return data.quote;
    return null;
  } catch {
    return null; // AbortError / network: fail silently
  }
}

interface QuoteDisplayProps {
  enabled?: boolean;
}

export function QuoteDisplay({ enabled = true }: QuoteDisplayProps) {
  const { data: quote, isLoading, error } = useQuery({
    queryKey: ['random-quote'],
    queryFn: fetchRandomQuote,
    enabled,
    staleTime: 1000 * 60 * 60 * 12, // Cache for 12 hours
    refetchInterval: 1000 * 60 * 60 * 12, // Auto-refresh every 12 hours (43,200,000 ms)
    refetchOnWindowFocus: false,
    refetchOnMount: false, // Don't refetch on mount if data is still fresh
    refetchIntervalInBackground: false, // Only refetch when tab is active
  });

  if (!enabled) {
    return null;
  }

  if (error) {
    return null; // Fail silently
  }

  if (isLoading) {
    return (
      <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
        <CardContent className="p-6">
          <div className="space-y-3">
            <Skeleton className="h-6 w-full max-w-md" />
            <Skeleton className="h-4 w-32" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!quote) {
    return null;
  }

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
      <CardContent className="p-6">
        <div className="flex items-start gap-4">
          <Quote className="h-5 w-5 text-muted-foreground mt-1 flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <blockquote className="text-lg font-serif italic text-foreground leading-relaxed">
              "{quote.quote_text}"
            </blockquote>
            <p className="text-sm text-muted-foreground font-medium">
              — {quote.author}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
