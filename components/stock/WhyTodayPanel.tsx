'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import Link from 'next/link';

type Status = 'idle' | 'searching' | 'streaming' | 'done' | 'error' | 'upgrade';
type ErrorCode = 'payment_required' | 'invalid_key' | 'rate_limited' | 'unknown';

interface Props {
  ticker: string;
  price: number;
  change: number;
  changePct: number;
  open: boolean;
  onClose: () => void;
}

export function WhyTodayPanel({ ticker, price, change, changePct, open, onClose }: Props) {
  const [status, setStatus] = useState<Status>('idle');
  const [text, setText] = useState('');
  const [errorCode, setErrorCode] = useState<ErrorCode>('unknown');
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open) {
      abortRef.current?.abort();
      const t = setTimeout(() => { setStatus('idle'); setText(''); }, 0);
      return () => clearTimeout(t);
    }

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    (async () => {
      setStatus('searching');
      setText('');
      try {
        const res = await fetch('/api/ai/why-today', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticker, price, change, changePct }),
          signal: ctrl.signal,
        });

        if (res.status === 403) {
          setStatus('upgrade');
          return;
        }
        if (!res.ok) {
          setStatus('error');
          return;
        }

        const reader = res.body?.getReader();
        if (!reader) { setStatus('error'); return; }
        const dec = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = dec.decode(value);
          for (const line of chunk.split('\n')) {
            if (!line.startsWith('data: ')) continue;
            try {
              const event = JSON.parse(line.slice(6));
              if (event.type === 'searching') setStatus('searching');
              if (event.type === 'text') {
                setStatus('streaming');
                setText((t) => t + event.delta);
              }
              if (event.type === 'done') setStatus('done');
              if (event.type === 'error') {
                setErrorCode((event.code as ErrorCode) ?? 'unknown');
                setStatus('error');
              }
            } catch {
              // malformed line, skip
            }
          }
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') setStatus('error');
      }
    })();

    return () => ctrl.abort();
  }, [open, ticker, price, change, changePct]);

  if (!open) return null;

  return (
    <div className={cn(
      'border-t border-border/30 bg-muted/[0.08]',
      'px-5 py-4 animate-in fade-in slide-in-from-top-1 duration-200'
    )}>
      <div className="flex items-start justify-between gap-3">

        {/* Content */}
        <div className="flex-1 min-w-0">
          {(status === 'searching') && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary animate-pulse shrink-0 mt-0.5" />
              Searching the web for today&apos;s news on ${ticker}…
            </div>
          )}

          {(status === 'streaming' || status === 'done') && text && (
            <div className="text-sm text-foreground space-y-1.5 leading-relaxed">
              {text.split('\n').filter(Boolean).map((line, i) => (
                <p key={i} className={cn(
                  line.startsWith('•') ? 'pl-0' : 'text-muted-foreground text-xs'
                )}>
                  {line}
                </p>
              ))}
              {status === 'streaming' && (
                <span className="inline-block h-3.5 w-0.5 bg-foreground/60 animate-pulse ml-0.5 align-middle" />
              )}
            </div>
          )}

          {status === 'error' && (
            <p className="text-xs text-muted-foreground">
              {errorCode === 'payment_required' && 'Anthropic API credits required. Add credits at console.anthropic.com.'}
              {errorCode === 'invalid_key' && 'Invalid Anthropic API key. Check ANTHROPIC_API_KEY in .env.local.'}
              {errorCode === 'rate_limited' && 'Too many requests. Please wait a moment and try again.'}
              {errorCode === 'unknown' && 'Couldn\'t fetch the analysis. Check the server logs for details.'}
            </p>
          )}

          {status === 'upgrade' && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Real-time AI news analysis is a <span className="text-foreground font-medium">Pro</span> feature.
              </p>
              <Link
                href="/upgrade"
                className="inline-flex items-center rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Upgrade to Pro →
              </Link>
            </div>
          )}
        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          className="shrink-0 text-muted-foreground/50 hover:text-foreground transition-colors text-xs mt-0.5"
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      {/* Powered by label */}
      {(status === 'streaming' || status === 'done') && (
        <p className="mt-3 text-[10px] text-muted-foreground/30 select-none">
          Powered by Claude + live web search
        </p>
      )}
    </div>
  );
}
