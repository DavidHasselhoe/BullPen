'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface IngestionProgressBarProps {
  ticker: string;
  onComplete?: () => void;
  onError?: (error: Error) => void;
}

/**
 * Real-time progress bar for ingestion process.
 * Automatically starts ingestion via SSE when mounted.
 * Shows error state with retry button on failure — never disappears silently.
 */
export function IngestionProgressBar({ ticker, onComplete, onError }: IngestionProgressBarProps) {
  const [currentStep, setCurrentStep] = useState<string>('');
  const [progressPercent, setProgressPercent] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [showCompletionAnimation, setShowCompletionAnimation] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  const eventSourceRef = useRef<EventSource | null>(null);
  const hasReceivedMessageRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onCompleteRef.current = onComplete;
    onErrorRef.current = onError;
  }, [onComplete, onError]);

  const handleRetry = useCallback(() => {
    setHasError(false);
    setErrorMessage('');
    setCurrentStep('');
    setProgressPercent(0);
    setIsComplete(false);
    setShowCompletionAnimation(false);
    hasReceivedMessageRef.current = false;
    setRetryKey((k) => k + 1);
  }, []);

  const getSimpleDescription = (step: string): string => {
    const stepLower = step.toLowerCase();
    if (stepLower.includes('looking up') || stepLower.includes('company information') || stepLower.includes('company found')) return 'Finding company information';
    if (stepLower.includes('creating company') || stepLower.includes('company record') || stepLower.includes('setting up')) return 'Setting things up';
    if (stepLower.includes('fetching') || stepLower.includes('downloading') || stepLower.includes('ingesting')) return 'Downloading reports';
    if (stepLower.includes('parsing') || stepLower.includes('processing') || stepLower.includes('filing') || stepLower.includes('classified')) return 'Reading documents';
    if (stepLower.includes('extract') && stepLower.includes('metric')) return 'Extracting numbers';
    if (stepLower.includes('ai') || stepLower.includes('analyzing')) return 'Analyzing data';
    if (stepLower.includes('generating') || stepLower.includes('signals') || stepLower.includes('insights')) return 'Finding insights';
    if (stepLower.includes('trend') || stepLower.includes('detecting')) return 'Spotting trends';
    if (stepLower.includes('calculating') || stepLower.includes('score')) return 'Calculating scores';
    if (stepLower.includes('finalizing') || stepLower.includes('completed') || stepLower.includes('marking')) return 'Almost done';
    return 'Working on it';
  };

  useEffect(() => {
    const eventSource = new EventSource(`/api/ingest/lazy/progress?ticker=${encodeURIComponent(ticker)}`);
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      try {
        hasReceivedMessageRef.current = true;
        const data = JSON.parse(event.data);

        if (data.type === 'connected') return;

        if (data.type === 'progress' && data.step) {
          setCurrentStep(getSimpleDescription(data.step));

          const stepLower = data.step.toLowerCase();
          let stepProgress = 0;
          if (stepLower.includes('looking up') || stepLower.includes('company found')) stepProgress = 10;
          else if (stepLower.includes('setting up') || stepLower.includes('creating company')) stepProgress = 20;
          else if (stepLower.includes('fetching') || stepLower.includes('downloading')) stepProgress = 40;
          else if (stepLower.includes('parsing') || stepLower.includes('processing') || stepLower.includes('filing')) stepProgress = 50;
          else if (stepLower.includes('extract') && stepLower.includes('metric')) stepProgress = 65;
          else if (stepLower.includes('ai') || stepLower.includes('analyzing')) stepProgress = 75;
          else if (stepLower.includes('generating') || stepLower.includes('insights')) stepProgress = 85;
          else if (stepLower.includes('trend')) stepProgress = 90;
          else if (stepLower.includes('calculating') || stepLower.includes('score')) stepProgress = 95;
          else if (stepLower.includes('finalizing') || stepLower.includes('completed')) stepProgress = 99;

          setProgressPercent((prev) => Math.max(prev, stepProgress));
        } else if (data.type === 'complete') {
          setProgressPercent(100);
          setCurrentStep('All done!');
          setShowCompletionAnimation(true);
          setIsComplete(true);
          eventSource.close();
          setTimeout(() => {
            onCompleteRef.current?.();
          }, 500);
        } else if (data.type === 'error') {
          setHasError(true);
          setErrorMessage(data.error || 'Something went wrong. Please try again.');
          setCurrentStep('');
          eventSource.close();
          onErrorRef.current?.(new Error(data.error || 'Unknown error'));
        }
      } catch (err) {
        console.error('Error parsing SSE message:', err);
      }
    };

    eventSource.onerror = () => {
      if (eventSource.readyState === EventSource.CLOSED) {
        if (!hasReceivedMessageRef.current && !isComplete && !hasError) {
          setHasError(true);
          setErrorMessage('Connection lost. Please try again.');
          eventSource.close();
        }
      }
    };

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
    // retryKey causes this effect to re-run on retry, creating a fresh EventSource
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticker, retryKey]);

  return (
    <Card className={cn(
      'mb-6 border-primary/50 transition-all duration-500',
      isComplete && 'border-green-500/50 bg-green-500/5',
      hasError && 'border-destructive/50 bg-destructive/5',
    )}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {isComplete ? (
            <CheckCircle2 className={cn(
              'h-5 w-5 text-green-600 dark:text-green-400 transition-all duration-500',
              showCompletionAnimation && 'animate-in zoom-in-95 scale-110',
            )} />
          ) : hasError ? (
            <AlertCircle className="h-5 w-5 text-destructive" />
          ) : (
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          )}
          {isComplete ? 'All done!' : hasError ? 'Something went wrong' : `Analyzing ${ticker}`}
        </CardTitle>

        {!isComplete && !hasError && currentStep && (
          <p className="text-sm text-muted-foreground mt-1">{currentStep}</p>
        )}
        {isComplete && (
          <p className="text-sm text-green-600 dark:text-green-400 mt-1 animate-in fade-in duration-500">
            Your data is ready.
          </p>
        )}
        {hasError && (
          <p className="text-sm text-muted-foreground mt-1">{errorMessage}</p>
        )}
      </CardHeader>

      <CardContent>
        {!isComplete && !hasError && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Progress</span>
              <span className="font-medium">{progressPercent}%</span>
            </div>
            <Progress value={progressPercent} className="h-2" />
          </div>
        )}

        {isComplete && showCompletionAnimation && (
          <div className="flex flex-col items-center justify-center py-8 space-y-3">
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-green-500/20 animate-ping opacity-75" />
              <CheckCircle2 className="relative h-12 w-12 text-green-600 dark:text-green-400 animate-scale-in" />
            </div>
            <p className="text-sm font-medium text-foreground animate-fade-in-up">All done!</p>
          </div>
        )}

        {hasError && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleRetry}
            className="flex items-center gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Try again
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
