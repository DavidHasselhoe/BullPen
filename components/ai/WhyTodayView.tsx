'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Link from 'next/link';
import { cn } from '@/lib/utils';

type Status = 'searching' | 'streaming' | 'done' | 'error' | 'upgrade';
type ErrorCode = 'payment_required' | 'invalid_key' | 'rate_limited' | 'unknown';

interface Props {
  ticker: string;
  price: number;
  change: number;
  changePct: number;
}

/**
 * Fills the Ask Bull sidepanel body with a streaming Claude + web-search
 * explanation for why `ticker` moved today. Mounted by AISidePanel when
 * `whyToday` is set (see AIPanelProvider.openWhyToday) — one fetch per
 * mount, keyed by the caller so a repeat "Why?" click remounts and restarts.
 */
export function WhyTodayView({ ticker, price, change, changePct }: Props) {
  const { i18n } = useTranslation();
  const [status, setStatus] = useState<Status>('searching');
  const [text, setText] = useState('');
  const [errorCode, setErrorCode] = useState<ErrorCode>('unknown');
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    (async () => {
      try {
        const res = await fetch('/api/ai/why-today', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticker, price, change, changePct, language: i18n.language }),
          signal: ctrl.signal,
        });

        if (res.status === 402) {
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
    // Intentionally empty deps: ticker/price/change/changePct are a one-time
    // snapshot captured by openWhyToday() at click time, not live-ticking
    // values — this is what fixes the "regenerates on price tick" bug.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-5 py-5 scrollbar-hide">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-sm font-semibold text-foreground">${ticker}</span>
        <span className={cn(
          'text-sm font-medium tabular-nums',
          changePct >= 0 ? 'text-emerald-400' : 'text-red-400'
        )}>
          {changePct >= 0 ? '+' : ''}{change.toFixed(2)} ({changePct >= 0 ? '+' : ''}{changePct.toFixed(2)}%) today
        </span>
      </div>

      {status === 'searching' && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary animate-pulse shrink-0" />
          Searching the web for today&apos;s news on ${ticker}…
        </div>
      )}

      {(status === 'streaming' || status === 'done') && text && (
        <div className="text-sm text-foreground space-y-2 leading-relaxed">
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
        <p className="text-sm text-muted-foreground">
          {errorCode === 'rate_limited'
            ? 'Too many requests. Please wait a moment and try again.'
            : "Couldn't load an explanation right now. Please try again shortly."}
        </p>
      )}

      {status === 'upgrade' && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Real-time AI news analysis is a <span className="text-foreground font-medium">Pro</span> feature.
          </p>
          <Link
            href="/upgrade"
            className="inline-flex items-center rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Upgrade to Pro →
          </Link>
        </div>
      )}

      {(status === 'streaming' || status === 'done') && (
        <p className="mt-4 text-[10px] text-muted-foreground/80 select-none">
          Powered by Claude + live web search
        </p>
      )}
    </div>
  );
}
