'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { InkBullets } from './InkText';
import { whyBullets } from '@/lib/ai/why-today-shared';
import { trackEvent } from '@/lib/analytics/track';

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
  const { t, i18n } = useTranslation('ai');
  const [status, setStatus] = useState<Status>('searching');
  const [text, setText] = useState('');
  const [errorCode, setErrorCode] = useState<ErrorCode>('unknown');
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    // Analytics: time to the first word, and whether it was a cache hit (a
    // fresh answer always searches first). Production latency for both paths.
    const startedAt = performance.now();
    let searched = false;
    let answered = false;
    const failed = (code: string) => trackEvent('why_panel_failed', { ticker, code });

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
          failed(String(res.status));
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
              if (event.type === 'searching') {
                searched = true;
                setStatus('searching');
                setText('');
              }
              if (event.type === 'text') {
                if (!answered) {
                  answered = true;
                  trackEvent('why_panel_answered', { ticker, cached: !searched, ms: Math.round(performance.now() - startedAt) });
                }
                setStatus('streaming');
                setText((t) => t + event.delta);
              }
              if (event.type === 'done') setStatus('done');
              if (event.type === 'error') {
                failed(event.code ?? 'unknown');
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

  // Words are released at a writing pace rather than as they arrive: Claude
  // streams in bursts after its search, and a cached answer comes as one
  // chunk that would otherwise appear all at once. The pace speeds up with
  // the backlog, so a whole cached answer still lands in under a second.
  const words = text.split(/(\s+)/);
  const totalWords = words.filter((w) => w.trim()).length;
  const [shown, setShown] = useState(0);
  const [reducedMotion] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    if (reducedMotion || shown >= totalWords) return;
    const id = setTimeout(() => setShown((n) => Math.min(totalWords, n + Math.max(1, Math.ceil((totalWords - n) / 20)))), 32);
    return () => clearTimeout(id);
  }, [shown, totalWords, reducedMotion]);

  let seen = 0;
  const visible = reducedMotion
    ? text
    : words.filter((w) => (w.trim() ? ++seen <= shown : seen < shown)).join('');

  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-5 py-5 scrollbar-hide">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-sm font-semibold text-foreground">${ticker}</span>
        <span className={cn(
          'text-sm font-medium tabular-nums',
          changePct >= 0 ? 'text-emerald-400' : 'text-red-400'
        )}>
          {t('whyTodayChangeSummary', {
            change: `${changePct >= 0 ? '+' : ''}${change.toFixed(2)}`,
            changePct: `${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}`,
          })}
        </span>
      </div>

      {status === 'searching' && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <Sparkles className="h-3.5 w-3.5 shrink-0 animate-pulse" aria-hidden />
          {t('whyTodaySearching', { ticker })}
        </p>
      )}

      {/* Streamed words settle as they land; no cursor, the arriving ink says it's still writing. */}
      {/* Parsed like Home and the stock page (whyBullets). The answer is plain
          prose now; the old "•"-or-footnote styling showed it as small muted text. */}
      {(status === 'streaming' || status === 'done') && visible.trim() && (
        <InkBullets
          stagger={false}
          bullets={whyBullets(visible)}
          className="block text-pretty text-sm leading-relaxed text-foreground"
          bulletClassName={(i) => (i > 0 ? 'mt-2' : undefined)}
        />
      )}

      {status === 'error' && (
        <p className="text-sm text-muted-foreground">
          {errorCode === 'rate_limited'
            ? t('whyTodayRateLimited')
            : t('whyTodayGenericError')}
        </p>
      )}

      {status === 'upgrade' && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            <Trans
              i18nKey="whyTodayUpgradeNotice"
              ns="ai"
              components={{ pro: <span className="text-foreground font-medium" /> }}
            />
          </p>
          <Link
            href="/upgrade"
            className="inline-flex items-center rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            {t('whyTodayUpgradeCta')}
          </Link>
        </div>
      )}
    </div>
  );
}
