'use client';

import { useQuery } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'framer-motion';
import { Bell, BellOff } from 'lucide-react';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import { STARTER_STOCKS } from '@/lib/onboarding/starter-stocks';
import type { AlertChoices, StockPick } from '@/lib/onboarding/pending-onboarding';
import { GetStartedSignupForm } from './GetStartedSignupForm';
import { StepHeadline, StepShell } from './StepShell';

interface Quote { price: number; change: number; changePercent: number; stale?: boolean }

const EXAMPLE_TICKERS = ['NVDA', 'AAPL', 'KO'];
const MAX_SHOWN = 6;
const ALERT_WORDS: Record<keyof AlertChoices, string> = {
  price_alerts: 'big price moves',
  upcoming_earnings: 'earnings',
  dividend_reminder: 'dividend dates',
};

// With no picks the rows are examples that are NOT added to the watchlist
// (flush.ts only saves pending.picks), so the promise must not name them.
function alertsSentence(alerts: AlertChoices, isExample: boolean): string {
  const on = (Object.keys(alerts) as (keyof AlertChoices)[]).filter((k) => alerts[k]).map((k) => ALERT_WORDS[k]);
  if (on.length === 0) return 'Alerts are off. You can turn them on anytime in Settings.';
  const list = on.length === 1 ? on[0] : `${on.slice(0, -1).join(', ')} and ${on[on.length - 1]}`;
  return isExample
    ? `Add stocks to your watchlist and we'll notify you about ${list} for them.`
    : `We'll notify you about ${list} for these stocks.`;
}

export function PreviewStep({
  picks,
  alerts,
  stepIndex,
  totalSteps,
  onBack,
}: {
  picks: StockPick[];
  alerts: AlertChoices;
  stepIndex: number;
  totalSteps: number;
  onBack: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const isExample = picks.length === 0;
  const shown: StockPick[] = isExample
    ? STARTER_STOCKS.filter((s) => EXAMPLE_TICKERS.includes(s.ticker))
    : picks.slice(0, MAX_SHOWN);
  const hiddenCount = picks.length - shown.length;
  const tickers = shown.map((s) => s.ticker);
  const AlertIcon = Object.values(alerts).some(Boolean) ? Bell : BellOff;

  const { data: quotes } = useQuery({
    queryKey: ['onboarding-preview-quotes', tickers],
    queryFn: async (): Promise<Record<string, Quote>> => {
      const res = await fetch('/api/quotes/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols: tickers }),
      });
      if (!res.ok) return {};
      return (await res.json()).quotes ?? {};
    },
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const { data: scores } = useQuery({
    queryKey: ['onboarding-preview-scores', tickers],
    queryFn: async (): Promise<Record<string, { score: number; grade: string }>> => {
      const res = await fetch(`/api/onboarding/health-scores?symbols=${encodeURIComponent(tickers.join(','))}`);
      if (!res.ok) return {};
      return (await res.json()).scores ?? {};
    },
    staleTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  return (
    <StepShell stepIndex={stepIndex} totalSteps={totalSteps} onBack={onBack} maxWidth={480}>
      <StepHeadline text="Your BullPen is" accent="ready." />
      <p style={{ margin: '0 0 24px', textAlign: 'center', fontSize: 15, color: 'var(--fg-muted)' }}>
        {isExample ? 'You skipped picking stocks. Here is how a few popular ones are doing right now.' : 'Your watchlist, live.'}
      </p>

      {/* One container with divided rows reads as a watchlist, not a stack of
          separate cards. Rows arrive one after another, which is the one bit
          of motion on this screen: the list is the thing being handed over. */}
      <ul
        style={{
          listStyle: 'none', margin: 0, padding: 0, borderRadius: 18, overflow: 'hidden',
          border: '1px solid var(--border)', background: 'var(--surface)',
        }}
      >
        {shown.map((s, i) => {
          const q = quotes?.[s.ticker];
          const hs = scores?.[s.ticker];
          const up = (q?.changePercent ?? 0) >= 0;
          return (
            <motion.li
              key={s.ticker}
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.32, delay: 0.1 + i * 0.07, ease: [0.22, 1, 0.36, 1] }}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
                borderTop: i === 0 ? 'none' : '1px solid var(--border)',
              }}
            >
              <CompanyLogo name={s.name} ticker={s.ticker} size={32} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="mono" style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--fg)' }}>{s.ticker}</span>
                <span style={{ display: 'block', fontSize: 13, color: 'var(--fg-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {s.name}{hs ? ` · Health ${hs.score} (${hs.grade})` : ''}
                </span>
              </span>
              {q ? (
                <span style={{ textAlign: 'right' }}>
                  <span className="mono" style={{ display: 'block', fontSize: 15, fontWeight: 600, color: 'var(--fg)' }}>${q.price.toFixed(2)}</span>
                  <span className={`mono ${up ? 'up' : 'down'}`} style={{ display: 'block', fontSize: 13 }}>
                    {up ? '▲ +' : '▼ −'}{Math.abs(q.changePercent).toFixed(2)}%{q.stale ? ' last close' : ''}
                  </span>
                </span>
              ) : (
                <span aria-hidden style={{ display: 'grid', gap: 6, justifyItems: 'end' }}>
                  <span style={{ width: 64, height: 14, borderRadius: 4, background: 'var(--border)' }} />
                  <span style={{ width: 44, height: 12, borderRadius: 4, background: 'var(--border)' }} />
                </span>
              )}
            </motion.li>
          );
        })}
        {hiddenCount > 0 && (
          <li style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', fontSize: 13, color: 'var(--fg-dim)', textAlign: 'center' }}>
            +{hiddenCount} more in your watchlist
          </li>
        )}
      </ul>

      {/* Icon inline with the text, not a flex sibling: when the sentence wraps
          on a phone, a flex icon floats alone at the left edge. */}
      <p style={{ margin: '16px 0 0', fontSize: 14, lineHeight: 1.5, color: 'var(--fg-muted)', textAlign: 'center', textWrap: 'balance' }}>
        <AlertIcon size={15} aria-hidden style={{ display: 'inline', verticalAlign: '-2px', marginRight: 6 }} />
        {alertsSentence(alerts, isExample)}
      </p>

      <GetStartedSignupForm />
    </StepShell>
  );
}
