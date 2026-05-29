'use client';

import { useEffect, useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle2, XCircle, FileText, TrendingUp, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ProgressUpdate {
  type: 'progress' | 'complete' | 'error';
  step?: string;
  details?: unknown;
  error?: string;
  result?: unknown;
  timestamp: string;
}

interface IngestionProgressProps {
  ticker: string;
  onComplete?: (result: unknown) => void;
  onError?: (error: string) => void;
}

const STEP_WEIGHTS: Record<string, number> = {
  'Looking up company information': 5,
  'Company found': 10,
  'Setting up company profile': 15,
  'Fetching annual report': 25,
  'Fetching quarterly reports': 40,
  'Downloading reports': 45,
  'Processing documents': 55,
  'Extracting financial metrics': 70,
  'Analyzing with AI': 80,
  'Generating insights': 85,
  'Detecting trends': 90,
  'Calculating scores': 95,
  'Finalizing': 100,
};

/**
 * IngestionProgress Component
 * Displays real-time progress of lazy ingestion using Server-Sent Events
 */
export function IngestionProgress({ ticker, onComplete, onError }: IngestionProgressProps) {
  const [currentStep, setCurrentStep] = useState<string>('Initializing...');
  const [progress, setProgress] = useState(0);
  const [steps, setSteps] = useState<Array<{ step: string; timestamp: string; completed: boolean }>>([]);
  const [isComplete, setIsComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    // Create EventSource for SSE
    const eventSource = new EventSource(`/api/ingest/lazy/progress?ticker=${encodeURIComponent(ticker)}`);
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      try {
        const data: ProgressUpdate = JSON.parse(event.data);

        if (data.type === 'progress' && data.step) {
          setCurrentStep(data.step);
          const stepProgress = STEP_WEIGHTS[data.step] || 0;
          setProgress((prev) => Math.max(prev, stepProgress));
          
          // Add step to history
          setSteps((prev) => {
            // Mark previous step as completed if it exists
            const updated = prev.map((s) => ({ ...s, completed: true }));
            // Add new step if not already in list
            const exists = updated.some(s => s.step === data.step);
            if (!exists) {
              return [...updated, { step: data.step!, timestamp: data.timestamp, completed: false }];
            }
            return updated;
          });
        } else if (data.type === 'complete') {
          setIsComplete(true);
          setProgress(100);
          setCurrentStep('Analysis complete!');
          if (onComplete) {
            onComplete(data.result);
          }
          eventSource.close();
        } else if (data.type === 'error') {
          setError(data.error || 'Unknown error occurred');
          if (onError) {
            onError(data.error || 'Unknown error');
          }
          eventSource.close();
        }
      } catch (err) {
        // SSE parsing error - silently handle
        // Errors will be shown via error state
      }
    };

    eventSource.onerror = () => {
      // SSE connection error - will be handled by error state
      // Don't set error immediately - might be connection issue
      // Only close if already complete or after timeout
      if (eventSource.readyState === EventSource.CLOSED) {
        if (!isComplete && !error) {
          setError('Connection lost. Please refresh the page.');
          if (onError) {
            onError('Connection error');
          }
        }
      }
    };

    return () => {
      eventSource.close();
    };
  }, [ticker, onComplete, onError, isComplete, error]);

  const getStepIcon = (step: string) => {
    const stepLower = step.toLowerCase();
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

  if (error) {
    return (
      <Card className="border-destructive/50 bg-destructive/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <XCircle className="h-5 w-5" />
            Analysis Failed
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">{error}</p>
        </CardContent>
      </Card>
    );
  }

  if (isComplete) {
    return (
      <Card className="border-green-500/50 bg-green-500/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-green-700 dark:text-green-400">
            <CheckCircle2 className="h-5 w-5" />
            Analysis Complete
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {ticker} has been successfully analyzed. Data is now available.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/50">
      <CardHeader>
        <CardTitle className="text-lg">Analyzing {ticker}</CardTitle>
        <p className="text-sm text-muted-foreground mt-1">
          Fetching and processing SEC filings. This may take a minute.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Progress</span>
            <span className="font-medium">{progress}%</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        {/* Current Step */}
        <div className="flex items-center gap-3 rounded-lg border bg-muted/50 p-3">
          <div className="flex-shrink-0">
            {getStepIcon(currentStep)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">{currentStep}</p>
          </div>
        </div>

        {/* Step History */}
        {steps.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Steps Completed
            </p>
            <div className="space-y-1.5">
              {steps.slice(-5).reverse().map((stepItem, index) => (
                <div
                  key={`${stepItem.step}-${stepItem.timestamp}`}
                  className={cn(
                    'flex items-center gap-2 text-xs transition-opacity',
                    stepItem.completed ? 'opacity-60' : 'opacity-100'
                  )}
                >
                  {stepItem.completed ? (
                    <CheckCircle2 className="h-3 w-3 text-green-600 dark:text-green-400" />
                  ) : (
                    <div className="h-3 w-3 rounded-full border-2 border-primary" />
                  )}
                  <span className={cn(
                    'text-muted-foreground',
                    !stepItem.completed && 'font-medium text-foreground'
                  )}>
                    {stepItem.step}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
