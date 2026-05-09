'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ThesisInput } from './ThesisInput';
import { StreamingThoughts } from './StreamingThoughts';
import { PortfolioResult } from './PortfolioResult';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertCircle } from 'lucide-react';
import type { Portfolio } from '@/lib/ai/portfolio-builder/schema';

type Phase = 'idle' | 'streaming' | 'composing' | 'validating' | 'done' | 'error';
type ErrorCode = 'invalid_key' | 'payment_required' | 'rate_limited' | 'parse_failed' | 'too_few_valid_tickers' | 'unknown';

interface DoneEvent {
  type: 'done';
  portfolio: Portfolio;
  logoMap: Record<string, string | null>;
  replacedTickers: string[];
}

export function PortfolioBuilderClient() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [thinkingText, setThinkingText] = useState('');
  const [result, setResult] = useState<DoneEvent | null>(null);
  const [errorCode, setErrorCode] = useState<ErrorCode>('unknown');
  const [errorMessage, setErrorMessage] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  // Cleanup any in-flight stream on unmount
  useEffect(() => () => abortRef.current?.abort(), []);

  const reset = () => {
    abortRef.current?.abort();
    setPhase('idle');
    setThinkingText('');
    setResult(null);
    setErrorMessage('');
  };

  const submit = async (thesis: string) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setPhase('streaming');
    setThinkingText('');
    setResult(null);
    setErrorMessage('');

    try {
      const res = await fetch('/api/ai/portfolio-builder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thesis }),
        signal: ctrl.signal,
      });

      if (res.status === 429) {
        setErrorCode('rate_limited');
        setPhase('error');
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErrorMessage(data.error || `Request failed: ${res.status}`);
        setErrorCode('unknown');
        setPhase('error');
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        setPhase('error');
        return;
      }
      const dec = new TextDecoder();
      let leftover = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = leftover + dec.decode(value);
        const lines = chunk.split('\n');
        leftover = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === 'thinking') {
              setThinkingText((t) => t + event.delta);
            } else if (event.type === 'composing') {
              setPhase((p) => (p === 'streaming' ? 'composing' : p));
            } else if (event.type === 'validating') {
              setPhase('validating');
            } else if (event.type === 'done') {
              setResult(event as DoneEvent);
              setPhase('done');
            } else if (event.type === 'error') {
              setErrorCode((event.code as ErrorCode) ?? 'unknown');
              setErrorMessage(event.message ?? '');
              setPhase('error');
            }
          } catch {
            // malformed line, ignore
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setErrorMessage((err as Error).message ?? '');
        setErrorCode('unknown');
        setPhase('error');
      }
    }
  };

  // Idle — show input
  if (phase === 'idle') {
    return <ThesisInput onSubmit={submit} />;
  }

  // Done — show result
  if (phase === 'done' && result) {
    return (
      <PortfolioResult
        portfolio={result.portfolio}
        logoMap={result.logoMap}
        replacedTickers={result.replacedTickers}
        onReset={reset}
      />
    );
  }

  // Error — show error UI with retry
  if (phase === 'error') {
    return (
      <Card className="border-red-500/30 bg-red-500/[0.02]">
        <CardContent className="pt-6 pb-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-foreground mb-1">
                {errorTitle(errorCode)}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {errorBody(errorCode, errorMessage)}
              </p>
              <div className="mt-4 flex gap-2">
                <Button onClick={reset} size="sm" variant="outline">
                  Try Again
                </Button>
                {errorCode === 'rate_limited' && (
                  <Link
                    href="/upgrade"
                    className="inline-flex items-center justify-center text-xs font-medium text-muted-foreground hover:text-foreground transition-colors px-3 py-2"
                  >
                    Learn about Pro →
                  </Link>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // streaming / composing / validating — show live reasoning
  return (
    <StreamingThoughts text={thinkingText} composing={phase !== 'streaming'} />
  );
}

function errorTitle(code: ErrorCode): string {
  switch (code) {
    case 'rate_limited':
      return 'Rate limit reached';
    case 'payment_required':
      return 'API credits required';
    case 'invalid_key':
      return 'API key issue';
    case 'parse_failed':
      return 'Unexpected model response';
    case 'too_few_valid_tickers':
      return 'Couldn\'t verify enough tickers';
    default:
      return 'Something went wrong';
  }
}

function errorBody(code: ErrorCode, message: string): string {
  switch (code) {
    case 'rate_limited':
      return 'You\'ve hit the per-minute limit (5 generations). Wait a moment and try again.';
    case 'payment_required':
      return 'Anthropic API credits are required. Add credits at console.anthropic.com.';
    case 'invalid_key':
      return 'The Anthropic API key is missing or invalid. Check ANTHROPIC_API_KEY in .env.local.';
    case 'parse_failed':
      return 'The model returned an unexpected response shape. This is usually transient — try again.';
    case 'too_few_valid_tickers':
      return 'Most of the suggested tickers couldn\'t be verified against our index. Try rephrasing the thesis with more concrete language.';
    default:
      return message || 'An unexpected error occurred. Please try again.';
  }
}
