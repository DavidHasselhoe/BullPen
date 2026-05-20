'use client';

import { useQuery } from '@tanstack/react-query';
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

/**
 * Compact footer strip for motivational quotes (Market Wisdom).
 * Keeps information density high while offering optional inspiration.
 */
export function QuoteDisplay({ enabled = true }: QuoteDisplayProps) {
  const { data: quote, isLoading, error } = useQuery({
    queryKey: ['random-quote'],
    queryFn: fetchRandomQuote,
    enabled,
    staleTime: 1000 * 60 * 60 * 12, // Cache for 12 hours
    refetchInterval: 1000 * 60 * 60 * 12,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchIntervalInBackground: false,
  });

  if (!enabled) {
    return null;
  }

  if (error || !quote) {
    return null; // Fail silently
  }

  if (isLoading) {
    return (
      <div className="py-3 border-t border-border/40">
        <div className="h-4 w-64 animate-shimmer rounded" />
      </div>
    );
  }

  return (
    <div className="py-3 border-t border-border/40">
      <div className="flex items-center gap-2 text-sm">
        <Quote className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
        <span className="text-muted-foreground italic">
          "{quote.quote_text}"
        </span>
        <span className="text-muted-foreground/70">— {quote.author}</span>
      </div>
    </div>
  );
}
