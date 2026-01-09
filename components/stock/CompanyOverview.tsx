'use client';

import { useEffect, useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';

interface CompanyOverviewProps {
  companyId: string;
}

interface CompanyOverviewResponse {
  success: boolean;
  overview?: string;
  error?: string;
}

/**
 * Company Overview Component
 * Displays an AI-generated company overview with subtle text reveal animation
 */
export function CompanyOverview({ companyId }: CompanyOverviewProps) {
  const [displayedText, setDisplayedText] = useState('');
  const [isAnimating, setIsAnimating] = useState(false);
  const hasAnimatedRef = useRef(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['company-overview', companyId],
    queryFn: async (): Promise<string | null> => {
      const response = await fetch(`/api/company/${companyId}/overview`);
      const result: CompanyOverviewResponse = await response.json();

      if (result.success && result.overview) {
        return result.overview;
      }

      return null;
    },
    enabled: !!companyId,
    staleTime: Infinity, // Cache forever (overview doesn't change frequently)
  });

  // Text reveal animation (typewriter-style, but faster and smoother)
  useEffect(() => {
    if (!data || hasAnimatedRef.current || isAnimating) {
      return;
    }

    hasAnimatedRef.current = true;
    setIsAnimating(true);

    const sentences = data.split(/(?<=[.!?])\s+/).filter(s => s.trim());
    let currentSentenceIndex = 0;
    let currentText = '';

    const animateNextSentence = () => {
      if (currentSentenceIndex >= sentences.length) {
        setIsAnimating(false);
        setDisplayedText(data); // Ensure full text is displayed
        return;
      }

      const sentence = sentences[currentSentenceIndex];
      const words = sentence.split(/\s+/);
      let wordIndex = 0;

      const addNextWord = () => {
        if (wordIndex >= words.length) {
          currentText += ' '; // Add space after sentence
          currentSentenceIndex++;
          setDisplayedText(currentText);
          
          // Small delay between sentences
          setTimeout(() => {
            animateNextSentence();
          }, 200);
          return;
        }

        const word = words[wordIndex];
        currentText += (currentText && !currentText.endsWith(' ') ? ' ' : '') + word;
        setDisplayedText(currentText);
        wordIndex++;

        // Speed: 30ms per word for smooth animation
        setTimeout(addNextWord, 30);
      };

      addNextWord();
    };

    animateNextSentence();
  }, [data, isAnimating]);

  // Show nothing if error or no data
  if (error || (!isLoading && !data)) {
    return null;
  }

  return (
    <Card className="mb-8">
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Company Overview
          <span className="ml-2 text-xs font-normal text-muted-foreground/70">
            (AI-generated)
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        ) : (
          <p 
            className={cn(
              "text-sm text-foreground leading-relaxed",
              "animate-in fade-in slide-in-from-bottom-2 duration-300"
            )}
          >
            {displayedText || data}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
