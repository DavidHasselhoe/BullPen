'use client';

import { useEffect, useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle2, FileText, TrendingUp, Sparkles, Building2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface IngestionProgressBarProps {
  ticker: string;
  onComplete?: () => void;
  onError?: (error: Error) => void;
}

// Step weights for progress calculation
const STEP_WEIGHTS: Record<string, number> = {
  'Looking up company': 5,
  'Company found': 10,
  'Setting up profile': 15,
  'Fetching reports': 30,
  'Downloading reports': 40,
  'Processing documents': 50,
  'Extracting metrics': 65,
  'Analyzing with AI': 75,
  'Generating insights': 85,
  'Detecting trends': 90,
  'Calculating scores': 95,
  'Finalizing': 100,
};

// Unique step categories to avoid repetition
const STEP_CATEGORIES = new Set<string>();

/**
 * Real-time progress bar for ingestion process
 * Shows detailed step-by-step progress using SSE
 */
export function IngestionProgressBar({ ticker, onComplete, onError }: IngestionProgressBarProps) {
  const [currentStep, setCurrentStep] = useState<string>('');
  const [progressPercent, setProgressPercent] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());
  const [isComplete, setIsComplete] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [showCompletionAnimation, setShowCompletionAnimation] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const hasReceivedMessageRef = useRef(false);

  useEffect(() => {
    // Create EventSource for progress tracking
    const eventSource = new EventSource(`/api/ingest/lazy/progress?ticker=${encodeURIComponent(ticker)}`);
    eventSourceRef.current = eventSource;

    const simplifyStepName = (step: string): string => {
      const stepLower = step.toLowerCase();
      
      // Simplify and deduplicate step names
      if (stepLower.includes('looking up') || stepLower.includes('company information')) return 'Looking up company';
      if (stepLower.includes('company found')) return 'Company found';
      if (stepLower.includes('creating company') || stepLower.includes('company record') || stepLower.includes('using existing company')) return 'Setting up profile';
      if (stepLower.includes('ingesting') && (stepLower.includes('10-k') || stepLower.includes('10-q'))) return 'Fetching reports';
      if (stepLower.includes('fetching') || stepLower.includes('downloading')) return 'Downloading reports';
      if (stepLower.includes('parsing') || stepLower.includes('processing documents')) return 'Processing documents';
      if (stepLower.includes('extract') && stepLower.includes('metric')) return 'Extracting metrics';
      if (stepLower.includes('ai analysis') || stepLower.includes('analyzing with ai') || stepLower.includes('running ai')) return 'Analyzing with AI';
      if (stepLower.includes('generating signals') || stepLower.includes('signals') || stepLower.includes('generating insights')) return 'Generating insights';
      if (stepLower.includes('trend') || stepLower.includes('analyzing trends') || stepLower.includes('detecting trends')) return 'Detecting trends';
      if (stepLower.includes('composite score') || stepLower.includes('calculating') || stepLower.includes('calculating scores')) return 'Calculating scores';
      if (stepLower.includes('marking') || stepLower.includes('completed') || stepLower.includes('finalizing')) return 'Finalizing';
      if (stepLower.includes('using existing filings')) return 'Using existing data';
      if (stepLower.includes('filings ready') || stepLower.includes('filings ingested')) return 'Preparing files';
      
      // Remove prefixes like "10-K:", "10-Q:", etc.
      const cleaned = step.split(':').pop()?.trim() || step;
      return cleaned;
    };

    eventSource.onmessage = (event) => {
      try {
        hasReceivedMessageRef.current = true;
        const data = JSON.parse(event.data);

        // Handle connection confirmation
        if (data.type === 'connected') {
          return;
        }

        if (data.type === 'progress' && data.step) {
          const simplifiedStep = simplifyStepName(data.step);
          
          // Update current step
          setCurrentStep(simplifiedStep);
          
          // Calculate progress
          const stepProgress = STEP_WEIGHTS[simplifiedStep] || 0;
          setProgressPercent((prev) => Math.max(prev, stepProgress));

          // Add to completed steps set (automatically deduplicates)
          setCompletedSteps((prev) => {
            const newSet = new Set(prev);
            if (simplifiedStep && !simplifiedStep.includes('complete') && !simplifiedStep.includes('Error')) {
              newSet.add(simplifiedStep);
            }
            return newSet;
          });
        } else if (data.type === 'complete') {
          setProgressPercent(100);
          setCurrentStep('Analysis complete');
          
          // Trigger completion animation
          setShowCompletionAnimation(true);
          setIsComplete(true);
          
          eventSource.close();
          
          // Call onComplete after animation delay
          setTimeout(() => {
            onComplete?.();
          }, 1500);
        } else if (data.type === 'error') {
          setHasError(true);
          setCurrentStep(`Error: ${data.error || 'Unknown error'}`);
          eventSource.close();
          if (onError) {
            onError(new Error(data.error || 'Unknown error'));
          }
        }
      } catch (err) {
        console.error('Error parsing SSE message:', err);
      }
    };

    eventSource.onerror = () => {
      // EventSource.onerror fires for various reasons
      if (eventSource.readyState === EventSource.CLOSED) {
        // Only treat as error if we haven't received any messages
        if (!hasReceivedMessageRef.current && !isComplete && !hasError) {
          console.warn('SSE stream closed without messages');
          eventSource.close();
        }
      }
    };

    // Cleanup on unmount
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [ticker, onComplete, onError, isComplete, hasError]);

  const getStepIcon = (step: string) => {
    const stepLower = step.toLowerCase();
    if (stepLower.includes('looking up') || stepLower.includes('company found') || stepLower.includes('setting up')) {
      return <Building2 className="h-4 w-4" />;
    }
    if (stepLower.includes('fetch') || stepLower.includes('download')) {
      return <FileText className="h-4 w-4" />;
    }
    if (stepLower.includes('metric') || stepLower.includes('extract')) {
      return <TrendingUp className="h-4 w-4" />;
    }
    if (stepLower.includes('ai') || stepLower.includes('analyzing')) {
      return <Sparkles className="h-4 w-4" />;
    }
    return <Loader2 className="h-4 w-4 animate-spin" />;
  };

  return (
    <Card className={cn(
      "mb-6 border-primary/50 transition-all duration-500",
      isComplete && "border-green-500/50 bg-green-500/5",
      showCompletionAnimation && "animate-in fade-in slide-in-from-top-4"
    )}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {isComplete ? (
            <CheckCircle2 className={cn(
              "h-5 w-5 text-green-600 dark:text-green-400 transition-all duration-500",
              showCompletionAnimation && "animate-in zoom-in-95 scale-110"
            )} />
          ) : hasError ? (
            <Loader2 className="h-5 w-5 text-destructive" />
          ) : (
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          )}
          {isComplete ? 'Analysis Complete' : hasError ? 'Error' : `Analyzing ${ticker}`}
        </CardTitle>
        {!isComplete && !hasError && (
          <p className="text-sm text-muted-foreground mt-1">
            Processing SEC filings and extracting data.
          </p>
        )}
        {isComplete && (
          <p className="text-sm text-green-600 dark:text-green-400 mt-1 animate-in fade-in duration-500">
            All data has been processed and is ready to view.
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Current step with icon */}
        {currentStep && !isComplete && (
          <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex items-center gap-3 rounded-lg border bg-muted/50 p-3">
              <div className="flex-shrink-0">
                {getStepIcon(currentStep)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{currentStep}</p>
              </div>
            </div>
            
            {/* Progress bar */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Progress</span>
                <span className="font-medium">{progressPercent}%</span>
              </div>
              <Progress value={progressPercent} className="h-2" />
            </div>
          </div>
        )}

        {/* Completion animation with subtle entrance */}
        {isComplete && showCompletionAnimation && (
          <div className="flex flex-col items-center justify-center py-8 space-y-3">
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-green-500/20 animate-ping opacity-75" />
              <CheckCircle2 
                className="relative h-12 w-12 text-green-600 dark:text-green-400 animate-scale-in" 
              />
            </div>
            <p 
              className="text-sm font-medium text-foreground animate-fade-in-up"
              style={{
                animationDelay: '300ms',
                opacity: 0,
              }}
            >
              Analysis complete
            </p>
          </div>
        )}

        {/* Simplified completed steps list - only show unique steps */}
        {completedSteps.size > 0 && !isComplete && (
          <div className="space-y-2 pt-3 border-t">
            <div className="flex flex-wrap gap-2">
              {Array.from(completedSteps).slice(-6).map((step, idx) => (
                <div 
                  key={step} 
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md border border-green-500/20 bg-green-500/5 px-2 py-1 text-xs text-green-700 dark:text-green-400 transition-all",
                    "animate-in fade-in slide-in-from-bottom-2"
                  )}
                  style={{ animationDelay: `${idx * 30}ms` }}
                >
                  <CheckCircle2 className="h-3 w-3 flex-shrink-0" />
                  <span>{step}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
