'use client';

import { useEffect, useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle2, FileText, TrendingUp, Sparkles, Building2 } from 'lucide-react';

interface IngestionProgressBarProps {
  ticker: string;
  onComplete?: () => void;
  onError?: (error: Error) => void;
}

// Step weights for progress calculation
const STEP_WEIGHTS: Record<string, number> = {
  'Looking up company information': 5,
  'Company found': 10,
  'Setting up company profile': 15,
  'Fetching annual report': 25,
  'Fetching quarterly reports': 45,
  'Downloading reports': 50,
  'Processing documents': 55,
  'Extracting financial metrics': 70,
  'Analyzing with AI': 80,
  'Generating insights': 85,
  'Detecting trends': 90,
  'Calculating scores': 95,
  'Finalizing': 100,
};

/**
 * Real-time progress bar for ingestion process
 * Shows detailed step-by-step progress using SSE
 */
export function IngestionProgressBar({ ticker, onComplete, onError }: IngestionProgressBarProps) {
  const [currentStep, setCurrentStep] = useState<string>('');
  const [progressPercent, setProgressPercent] = useState(0);
  const [stepHistory, setStepHistory] = useState<Array<{ step: string; timestamp: number }>>([]);
  const [isComplete, setIsComplete] = useState(false);
  const [hasError, setHasError] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const hasReceivedMessageRef = useRef(false);

  useEffect(() => {
    // Create EventSource for progress tracking
    const eventSource = new EventSource(`/api/ingest/lazy/progress?ticker=${encodeURIComponent(ticker)}`);
    eventSourceRef.current = eventSource;

    const simplifyStepName = (step: string): string => {
      const stepLower = step.toLowerCase();
      if (stepLower.includes('looking up') || stepLower.includes('company information')) return 'Looking up company information';
      if (stepLower.includes('company found')) return 'Company found';
      if (stepLower.includes('creating company') || stepLower.includes('company record')) return 'Setting up company profile';
      if (stepLower.includes('ingesting') && stepLower.includes('10-k')) return 'Fetching annual report';
      if (stepLower.includes('ingesting') && stepLower.includes('10-q')) return 'Fetching quarterly reports';
      if (stepLower.includes('fetching') || stepLower.includes('downloading')) return 'Downloading reports';
      if (stepLower.includes('parsing') || stepLower.includes('extracting')) return 'Processing documents';
      if (stepLower.includes('extract') && stepLower.includes('metric')) return 'Extracting financial metrics';
      if (stepLower.includes('ai analysis') || stepLower.includes('analyzing')) return 'Analyzing with AI';
      if (stepLower.includes('generating signals') || stepLower.includes('signals')) return 'Generating insights';
      if (stepLower.includes('trend') || stepLower.includes('analyzing trends')) return 'Detecting trends';
      if (stepLower.includes('composite score') || stepLower.includes('calculating')) return 'Calculating scores';
      if (stepLower.includes('marking') || stepLower.includes('completed')) return 'Finalizing';
      return step.split(':')[0].trim();
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
          setCurrentStep(simplifiedStep);
          
          const stepProgress = STEP_WEIGHTS[simplifiedStep] || 0;
          setProgressPercent((prev) => Math.max(prev, stepProgress));

          // Add to history
          setStepHistory((prev) => {
            const newHistory = [...prev, { step: simplifiedStep, timestamp: Date.now() }];
            // Keep only last 5 steps
            return newHistory.slice(-5);
          });
        } else if (data.type === 'complete') {
          setIsComplete(true);
          setProgressPercent(100);
          setCurrentStep('Analysis complete!');
          eventSource.close();
          onComplete?.();
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
    <Card className="mb-6 border-primary/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {isComplete ? (
            <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
          ) : hasError ? (
            <Loader2 className="h-5 w-5 text-destructive" />
          ) : (
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          )}
          {isComplete ? 'Analysis Complete' : hasError ? 'Error' : `Analyzing ${ticker}`}
        </CardTitle>
        {!isComplete && !hasError && (
          <p className="text-sm text-muted-foreground mt-1">
            Fetching and processing SEC filings. This may take a minute.
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Current step with icon */}
        {currentStep && (
          <div className="space-y-3">
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
                <span className="text-muted-foreground">Overall progress</span>
                <span className="font-medium">{progressPercent}%</span>
              </div>
              <Progress value={progressPercent} className="h-2" />
            </div>
          </div>
        )}

        {/* Step history */}
        {stepHistory.length > 0 && !isComplete && (
          <div className="space-y-2 pt-3 border-t">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Completed Steps
            </p>
            <div className="space-y-1.5">
              {stepHistory.slice(-5).reverse().map((item, idx) => (
                <div key={idx} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <CheckCircle2 className="h-3 w-3 text-green-600 dark:text-green-400 flex-shrink-0" />
                  <span>{item.step}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
